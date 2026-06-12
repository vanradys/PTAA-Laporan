import { Router } from "express";
import {
  and,
  assignedDailyTasksTable,
  db,
  dailyTasksTable,
  dailyReportsTable,
  departmentsTable,
  eq,
  notificationsTable,
  sql,
  usersTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";

const router = Router();

const MAX_TASK_ACTIONS = 2;

function getTodayString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().split("T")[0];
}

function getRemainingActions(editCount: number): number {
  return Math.max(0, MAX_TASK_ACTIONS - editCount);
}

function isTaskLockedByCount(editCount: number): boolean {
  return getRemainingActions(editCount) <= 0;
}

function isTaskDelay(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (status === "selesai") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
  return deadline < getTodayString();
}

function formatAssignerRole(user: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}) {
  const role = String(user.role ?? "").toLowerCase();
  if (role === "admin_marketing") return "Admin Marketing";
  if (["direktur", "director", "dir"].includes(role)) return "Direktur";
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";

  const code = String(user.departmentCode ?? "").toUpperCase();
  if (code === "MKT") return "Marketing";
  if (code === "ENG") return "Engineering";
  if (code === "PUR") return "Purchasing";
  if (code === "GA") return "General Affairs";
  if (code === "AAF" || code === "FIN") return "Finance";

  return user.departmentName ?? "PTAA";
}

function buildAssignmentResponse(
  assignment: typeof assignedDailyTasksTable.$inferSelect,
) {
  return {
    id: assignment.id,
    assigneeUserId: assignment.assigneeUserId,
    assignedByUserId: assignment.assignedByUserId,
    assignedByName: assignment.assignedByName,
    assignedByRole: assignment.assignedByRole,
    title: assignment.title,
    project: assignment.project ?? null,
    notes: assignment.notes ?? null,
    status: assignment.status,
    createdTaskId: assignment.createdTaskId ?? null,
    respondedAt: assignment.respondedAt?.toISOString() ?? null,
    createdAt: assignment.createdAt.toISOString(),
  };
}

async function getOrCreateTodayReport(user: {
  id: number;
  departmentId?: number | null;
}) {
  const today = getTodayString();
  const existing = await db
    .select()
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, user.id), eq(dailyReportsTable.date, today)))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(dailyReportsTable)
    .values({
      userId: user.id,
      departmentId: user.departmentId ?? null,
      date: today,
      status: "draf",
    })
    .returning();

  return created;
}

function buildTaskResponse(task: typeof dailyTasksTable.$inferSelect) {
  const editCount = task.editCount ?? 0;

  return {
    id: task.id,
    reportId: task.reportId,
    title: task.title,
    project: task.project ?? null,
    deadline: task.deadline ?? null,
    progress: task.progress,
    status: task.status,
    notes: task.notes ?? null,
    editCount,
    remainingActions: getRemainingActions(editCount),
    isLocked: isTaskLockedByCount(editCount),
    isDelay: isTaskDelay(task.deadline, task.status),
    createdAt: task.createdAt.toISOString(),
  };
}

function getAddTaskError(report: typeof dailyReportsTable.$inferSelect): string | null {
  if (report.date !== getTodayString()) {
    return "Tugas dari tanggal sebelumnya sudah terkunci dan tidak bisa ditambahkan.";
  }

  if (report.status === "direview") {
    return "Laporan sudah direview, tugas baru tidak bisa ditambahkan.";
  }

  return null;
}

function getModifyTaskError(
  report: typeof dailyReportsTable.$inferSelect,
  task: typeof dailyTasksTable.$inferSelect,
): string | null {
  if (report.date !== getTodayString()) {
    return "Tugas dari tanggal sebelumnya sudah terkunci dan tidak bisa diedit atau dihapus.";
  }

  if (report.status === "direview") {
    return "Laporan sudah direview, tugas tidak bisa diedit atau dihapus.";
  }

  if (isTaskLockedByCount(task.editCount ?? 0)) {
    return "Batas edit/hapus tugas ini sudah mencapai 2x. Tugas sudah terkunci.";
  }

  return null;
}

router.get("/assigned-tasks/pending", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const assignments = await db
    .select()
    .from(assignedDailyTasksTable)
    .where(
      and(
        eq(assignedDailyTasksTable.assigneeUserId, user.id),
        eq(assignedDailyTasksTable.status, "pending"),
      ),
    )
    .orderBy(assignedDailyTasksTable.createdAt);

  res.json(assignments.map(buildAssignmentResponse));
});

router.post("/assigned-tasks", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const assigneeUserId = Number(req.body?.assigneeUserId);
  const title = String(req.body?.title ?? "").trim();
  const project = String(req.body?.project ?? "").trim();
  const notes = String(req.body?.notes ?? "").trim();

  if (!Number.isInteger(assigneeUserId)) {
    res.status(400).json({ error: "Penerima tugas wajib dipilih" });
    return;
  }
  if (assigneeUserId === user.id) {
    res.status(400).json({ error: "Tugas hanya bisa diberikan ke orang lain" });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "Isi tugas wajib diisi" });
    return;
  }

  const [assignee] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      isActive: usersTable.isActive,
      departmentName: departmentsTable.name,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, assigneeUserId))
    .limit(1);

  if (!assignee || assignee.isActive === false) {
    res.status(404).json({ error: "Penerima tugas tidak ditemukan atau tidak aktif" });
    return;
  }

  const assignedByRole = formatAssignerRole(user);
  const [assignment] = await db
    .insert(assignedDailyTasksTable)
    .values({
      assigneeUserId,
      assignedByUserId: user.id,
      assignedByName: user.name ?? assignedByRole,
      assignedByRole,
      title,
      project: project || null,
      notes: notes || null,
    })
    .returning();

  await db.insert(notificationsTable).values({
    userId: assigneeUserId,
    type: "assigned_daily_task",
    title: "Tugas harian baru",
    message: `Anda menerima tugas dari ${assignedByRole}: ${title}${project ? ` (Project: ${project})` : ""}`,
    isRead: false,
  });

  res.status(201).json(buildAssignmentResponse(assignment));
});

router.post("/assigned-tasks/:assignmentId/respond", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const assignmentId = Number(req.params.assignmentId);
  const accepted = req.body?.accepted === true || req.body?.action === "accept";

  const [assignment] = await db
    .select()
    .from(assignedDailyTasksTable)
    .where(
      and(
        eq(assignedDailyTasksTable.id, assignmentId),
        eq(assignedDailyTasksTable.assigneeUserId, user.id),
      ),
    )
    .limit(1);

  if (!assignment) {
    res.status(404).json({ error: "Notifikasi tugas tidak ditemukan" });
    return;
  }
  if (assignment.status !== "pending") {
    res.status(400).json({ error: "Notifikasi tugas ini sudah dijawab" });
    return;
  }

  if (!accepted) {
    const [declined] = await db
      .update(assignedDailyTasksTable)
      .set({ status: "declined", respondedAt: new Date() })
      .where(eq(assignedDailyTasksTable.id, assignment.id))
      .returning();

    res.json(buildAssignmentResponse(declined));
    return;
  }

  const report = await getOrCreateTodayReport(user);
  const addTaskError = getAddTaskError(report);
  if (addTaskError) {
    res.status(400).json({ error: addTaskError });
    return;
  }

  const [task] = await db
    .insert(dailyTasksTable)
    .values({
      reportId: report.id,
      title: assignment.title,
      project: assignment.project ?? null,
      progress: 0,
      status: "belum_mulai",
      notes: assignment.notes ?? null,
    })
    .returning();

  const [acceptedAssignment] = await db
    .update(assignedDailyTasksTable)
    .set({
      status: "accepted",
      createdTaskId: task.id,
      respondedAt: new Date(),
    })
    .where(eq(assignedDailyTasksTable.id, assignment.id))
    .returning();

  res.json({
    ...buildAssignmentResponse(acceptedAssignment),
    task: buildTaskResponse(task),
  });
});

router.get("/reports/:id/tasks", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const tasks = await db.select().from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, id))
    .orderBy(dailyTasksTable.createdAt);

  res.json(tasks.map(buildTaskResponse));
});

router.post("/reports/:id/tasks", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const reportId = parseInt(req.params.id);
  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId)).limit(1);

  if (!report[0]) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }
  if (report[0].userId !== user.id) { res.status(403).json({ error: "Tidak diizinkan" }); return; }

  const addTaskError = getAddTaskError(report[0]);
  if (addTaskError) {
    res.status(400).json({ error: addTaskError });
    return;
  }

  const { title, project, deadline, progress, status, notes } = req.body;
  if (!title || !title.trim()) { res.status(400).json({ error: "Nama tugas diperlukan" }); return; }

  const [task] = await db.insert(dailyTasksTable).values({
    reportId,
    title,
    project: project ?? null,
    deadline: deadline || null,
    progress: progress ?? 0,
    status: status ?? "belum_mulai",
    notes: notes ?? null,
  }).returning();

  res.status(201).json(buildTaskResponse(task));
});

router.patch("/tasks/:taskId", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const taskId = parseInt(req.params.taskId);
  const task = await db.select().from(dailyTasksTable).where(eq(dailyTasksTable.id, taskId)).limit(1);

  if (!task[0]) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }

  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, task[0].reportId)).limit(1);
  if (!report[0] || report[0].userId !== user.id) { res.status(403).json({ error: "Tidak diizinkan" }); return; }

  const modifyTaskError = getModifyTaskError(report[0], task[0]);
  if (modifyTaskError) {
    res.status(400).json({ error: modifyTaskError });
    return;
  }

  const { title, project, deadline, progress, status, notes } = req.body;

  if (title !== undefined && !String(title).trim()) {
    res.status(400).json({ error: "Nama tugas tidak boleh kosong" });
    return;
  }

  const hasUpdate =
    title !== undefined ||
    project !== undefined ||
    deadline !== undefined ||
    progress !== undefined ||
    status !== undefined ||
    notes !== undefined;

  if (!hasUpdate) {
    res.status(400).json({ error: "Tidak ada data tugas yang diubah" });
    return;
  }

  const [updated] = await db.update(dailyTasksTable)
    .set({
      ...(title !== undefined && { title }),
      ...(project !== undefined && { project }),
      ...(deadline !== undefined && { deadline: deadline || null }),
      ...(progress !== undefined && { progress }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
      editCount: sql`${dailyTasksTable.editCount} + 1`,
    })
    .where(eq(dailyTasksTable.id, taskId))
    .returning();

  res.json(buildTaskResponse(updated));
});

router.delete("/tasks/:taskId", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const taskId = parseInt(req.params.taskId);
  const task = await db.select().from(dailyTasksTable).where(eq(dailyTasksTable.id, taskId)).limit(1);

  if (!task[0]) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }

  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, task[0].reportId)).limit(1);
  if (!report[0] || report[0].userId !== user.id) { res.status(403).json({ error: "Tidak diizinkan" }); return; }

  const modifyTaskError = getModifyTaskError(report[0], task[0]);
  if (modifyTaskError) {
    res.status(400).json({ error: modifyTaskError });
    return;
  }

  await db.delete(dailyTasksTable).where(eq(dailyTasksTable.id, taskId));
  res.json({ success: true, message: "Tugas berhasil dihapus" });
});

export default router;

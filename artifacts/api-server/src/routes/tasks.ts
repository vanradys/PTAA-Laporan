import { Router } from "express";
import {
  and,
  assignedDailyTasksTable,
  db,
  dailyTasksTable,
  dailyReportsTable,
  departmentsTable,
  desc,
  eq,
  notificationsTable,
  or,
  sql,
  usersTable,
} from "@workspace/db";
import { getSessionTokenFromRequest, getUserFromToken } from "./auth";
import { canEditByPermission } from "../services/editPermissions";

const router = Router();
let dailyTasksCarryForwardStopSchemaReady: Promise<void> | null = null;

const MAX_TASK_ACTIONS = 2;
const TASK_PROGRESS_BY_STATUS: Record<string, number> = {
  belum_mulai: 0,
  menerima_permintaan: 25,
  inquiry: 25,
  input_data_proses: 50,
  proses: 50,
  review_approval: 75,
  delivered: 100,
  selesai: 100,
};

function normalizeTaskStatus(value: unknown): string {
  const status = String(value ?? "belum_mulai").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TASK_PROGRESS_BY_STATUS, status)
    ? status
    : "belum_mulai";
}

function getTaskProgress(status: unknown): number {
  return TASK_PROGRESS_BY_STATUS[normalizeTaskStatus(status)] ?? 0;
}

function getTaskIdentityKey(task: { title: string; project?: string | null }) {
  const normalizePart = (value: string | null | undefined) =>
    String(value ?? "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("id-ID")
      .replace(/\s+/g, " ");

  return `${normalizePart(task.project)}|${normalizePart(task.title)}`;
}

async function getHighestTaskProgressForIdentity(
  userId: number,
  reportDate: string,
  task: { title: string; project?: string | null },
  excludeTaskId?: number,
) {
  const historicalTasks = await db
    .select({
      id: dailyTasksTable.id,
      title: dailyTasksTable.title,
      project: dailyTasksTable.project,
      progress: dailyTasksTable.progress,
      status: dailyTasksTable.status,
    })
    .from(dailyTasksTable)
    .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
    .where(and(
      eq(dailyReportsTable.userId, userId),
      sql`${dailyReportsTable.date} <= ${reportDate}`,
    ));
  const identityKey = getTaskIdentityKey(task);

  return historicalTasks.reduce((highestProgress, historicalTask) => {
    if (
      historicalTask.id === excludeTaskId ||
      getTaskIdentityKey(historicalTask) !== identityKey
    ) {
      return highestProgress;
    }

    return Math.max(
      highestProgress,
      historicalTask.progress,
      getTaskProgress(historicalTask.status),
    );
  }, 0);
}

function getStatusForProgress(progress: number) {
  if (progress >= 100) return "delivered";
  if (progress >= 75) return "review_approval";
  if (progress >= 50) return "input_data_proses";
  if (progress >= 25) return "menerima_permintaan";
  return "belum_mulai";
}

function ensureDailyTasksCarryForwardStopSchema() {
  dailyTasksCarryForwardStopSchemaReady ??= db.execute(sql`
    alter table daily_tasks
      add column if not exists carry_forward_stopped_at timestamptz
  `).then(() => undefined);

  return dailyTasksCarryForwardStopSchemaReady.catch((error) => {
    dailyTasksCarryForwardStopSchemaReady = null;
    throw error;
  });
}

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

function canBypassTaskActionLimit(user?: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const role = String(user?.role ?? "").toLowerCase();
  if (role === "admin") return true;

  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  if (["AAF", "FIN"].includes(departmentCode)) return true;

  return String(user?.departmentName ?? "").toLowerCase().includes("finance");
}

function isTaskDelay(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (["selesai", "delivered"].includes(status)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
  return deadline < getTodayString();
}

function formatAssignerRole(user: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}) {
  const role = String(user.role ?? "").toLowerCase();
  if (role === "admin_marketing") return "Admin Marketing 2";
  if (role === "marketing_specialist") return "Marketing Specialist";
  if (["direktur", "director", "dir"].includes(role)) return "Direktur";
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";

  const code = String(user.departmentCode ?? "").toUpperCase();
  if (code === "MKT") return "Admin Marketing 1";
  if (code === "ENG") return "Engineering";
  if (code === "PUR") return "Purchasing";
  if (code === "GA") return "General Affairs";
  if (code === "AAF" || code === "FIN") return "Finance";

  return user.departmentName ?? "PTAA";
}

function getDepartmentLabel(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || "PTAA";
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
    assignedByDepartment: assignment.assignedByDepartment ?? null,
    assignedToName: assignment.assignedToName ?? null,
    assignedToDepartment: assignment.assignedToDepartment ?? null,
    title: assignment.title,
    project: assignment.project ?? null,
    notes: assignment.notes ?? null,
    status: assignment.status,
    responseNote: assignment.responseNote ?? null,
    createdTaskId: assignment.createdTaskId ?? null,
    respondedAt: assignment.respondedAt?.toISOString() ?? null,
    createdAt: assignment.createdAt.toISOString(),
  };
}

function buildAssignmentHistoryItem(
  assignment: typeof assignedDailyTasksTable.$inferSelect,
  direction: "received" | "given",
) {
  return {
    id: assignment.id,
    direction,
    department:
      direction === "received"
        ? getDepartmentLabel(assignment.assignedByDepartment ?? assignment.assignedByRole)
        : getDepartmentLabel(assignment.assignedToDepartment),
    assignedByUserId: assignment.assignedByUserId,
    assignedByName: assignment.assignedByName,
    assignedByRole: assignment.assignedByRole,
    assignedByDepartment: assignment.assignedByDepartment ?? null,
    assigneeUserId: assignment.assigneeUserId,
    assignedToName: assignment.assignedToName ?? null,
    assignedToDepartment: assignment.assignedToDepartment ?? null,
    title: assignment.title,
    project: assignment.project ?? null,
    notes: assignment.notes ?? null,
    status: assignment.status,
    responseNote: assignment.responseNote ?? null,
    createdTaskId: assignment.createdTaskId ?? null,
    assignedAt: assignment.createdAt.toISOString(),
    respondedAt: assignment.respondedAt?.toISOString() ?? null,
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
    completionInputType: task.completionInputType ?? null,
    completionValue: task.completionValue ?? null,
    progress: task.progress,
    status: task.status,
    notes: task.notes ?? null,
    reviewStatus: task.reviewStatus ?? null,
    reviewComment: task.reviewComment ?? null,
    reviewedByUserId: task.reviewedByUserId ?? null,
    reviewedByName: task.reviewedByName ?? null,
    reviewedAt: task.reviewedAt?.toISOString() ?? null,
    correctedAt: task.correctedAt?.toISOString() ?? null,
    revisionSourceTaskId: task.revisionSourceTaskId ?? null,
    revisionWorkTaskId: task.revisionWorkTaskId ?? null,
    carryForwardSourceTaskId: task.carryForwardSourceTaskId ?? null,
    editCount,
    remainingActions: getRemainingActions(editCount),
    isLocked: isTaskLockedByCount(editCount),
    isDelay: isTaskDelay(task.deadline, task.status),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
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
  user?: {
    role?: string | null;
    departmentCode?: string | null;
    departmentName?: string | null;
  },
): string | null {
  if (String(user?.role ?? "").toLowerCase() === "admin") {
    return null;
  }

  if (report.date !== getTodayString() && task.reviewStatus !== "revisi") {
    return "Tugas dari tanggal sebelumnya sudah terkunci dan tidak bisa diedit atau dihapus.";
  }

  if (report.status === "direview") {
    return "Laporan sudah direview, tugas tidak bisa diedit atau dihapus.";
  }

  if (
    task.reviewStatus !== "revisi" &&
    !canBypassTaskActionLimit(user) &&
    isTaskLockedByCount(task.editCount ?? 0)
  ) {
    return "Batas edit/hapus tugas ini sudah mencapai 2x. Tugas sudah terkunci.";
  }

  return null;
}

async function refreshReportReviewStatus(reportId: number) {
  const tasks = await db
    .select({ reviewStatus: dailyTasksTable.reviewStatus })
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, reportId));

  const revisionCount = tasks.filter((task) =>
    ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? ""),
  ).length;
  const correctedCount = tasks.filter((task) =>
    ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? ""),
  ).length;
  const reviewedCount = tasks.filter((task) => task.reviewStatus === "direview").length;
  const status =
    revisionCount > 0
      ? "perlu_revisi"
      : correctedCount > 0
        ? "selesai"
        : reviewedCount > 0
          ? "direview"
          : "dikirim";

  await db.update(dailyReportsTable).set({ status }).where(eq(dailyReportsTable.id, reportId));
  return { status, revisionCount };
}

async function stopDeletedTaskFromFutureCarryForward(
  task: typeof dailyTasksTable.$inferSelect,
  report: typeof dailyReportsTable.$inferSelect,
) {
  await ensureDailyTasksCarryForwardStopSchema();

  const sourceIds = new Set<number>();
  if (task.carryForwardSourceTaskId) {
    sourceIds.add(task.carryForwardSourceTaskId);
  }

  const [previousTask] = await db
    .select({ id: dailyTasksTable.id })
    .from(dailyTasksTable)
    .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
    .where(and(
      eq(dailyReportsTable.userId, report.userId),
      sql`${dailyReportsTable.date} < ${report.date}`,
      sql`trim(${dailyTasksTable.title}) = ${task.title.trim()}`,
      sql`trim(coalesce(${dailyTasksTable.project}, '')) = ${String(task.project ?? "").trim()}`,
    ))
    .orderBy(desc(dailyReportsTable.date), desc(dailyTasksTable.updatedAt), desc(dailyTasksTable.createdAt))
    .limit(1);

  if (previousTask) {
    sourceIds.add(previousTask.id);
  }

  if (sourceIds.size === 0) return;

  const stoppedAt = new Date();
  for (const sourceId of sourceIds) {
    await db
      .update(dailyTasksTable)
      .set({
        carryForwardStoppedAt: stoppedAt,
        updatedAt: stoppedAt,
      })
      .where(eq(dailyTasksTable.id, sourceId));
  }
}

async function stopCompletedTaskFromFutureCarryForward(
  task: typeof dailyTasksTable.$inferSelect,
  report: typeof dailyReportsTable.$inferSelect,
) {
  await ensureDailyTasksCarryForwardStopSchema();
  const historicalTasks = await db
    .select({
      id: dailyTasksTable.id,
      title: dailyTasksTable.title,
      project: dailyTasksTable.project,
    })
    .from(dailyTasksTable)
    .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
    .where(and(
      eq(dailyReportsTable.userId, report.userId),
      sql`${dailyReportsTable.date} <= ${report.date}`,
    ));
  const identityKey = getTaskIdentityKey(task);
  const completedAt = new Date();

  for (const historicalTask of historicalTasks) {
    if (getTaskIdentityKey(historicalTask) !== identityKey) continue;
    await db
      .update(dailyTasksTable)
      .set({ carryForwardStoppedAt: completedAt })
      .where(eq(dailyTasksTable.id, historicalTask.id));
  }
}

router.get("/assigned-tasks/pending", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
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

router.get("/assigned-tasks/history", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const assignments = await db
    .select()
    .from(assignedDailyTasksTable)
    .where(
      or(
        eq(assignedDailyTasksTable.assigneeUserId, user.id),
        eq(assignedDailyTasksTable.assignedByUserId, user.id),
      ),
    )
    .orderBy(desc(assignedDailyTasksTable.createdAt));

  res.json({
    received: assignments
      .filter((assignment) => assignment.assigneeUserId === user.id)
      .map((assignment) => buildAssignmentHistoryItem(assignment, "received")),
    given: assignments
      .filter((assignment) => assignment.assignedByUserId === user.id)
      .map((assignment) => buildAssignmentHistoryItem(assignment, "given")),
  });
});

router.post("/assigned-tasks", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!(await canEditByPermission(user, "daily_report_assign_tasks"))) {
    res.status(403).json({ error: "Tidak punya izin untuk memberi tugas harian" });
    return;
  }

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
  const assignedByDepartment = getDepartmentLabel(user.departmentName ?? assignedByRole);
  const [assignment] = await db
    .insert(assignedDailyTasksTable)
    .values({
      assigneeUserId,
      assignedByUserId: user.id,
      assignedByName: user.name ?? assignedByRole,
      assignedByRole,
      assignedByDepartment,
      assignedToName: assignee.name,
      assignedToDepartment: assignee.departmentName ?? null,
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
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const assignmentId = Number(req.params.assignmentId);
  const accepted = req.body?.accepted === true || req.body?.action === "accept";
  const responseNote =
    req.body?.responseNote === undefined
      ? undefined
      : String(req.body.responseNote ?? "").trim();

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
  if (accepted && !(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk menambahkan tugas ke laporan harian" });
    return;
  }

  if (!accepted) {
    const [rejected] = await db
      .update(assignedDailyTasksTable)
      .set({
        status: "rejected",
        responseNote: responseNote || null,
        respondedAt: new Date(),
      })
      .where(eq(assignedDailyTasksTable.id, assignment.id))
      .returning();

    res.json(buildAssignmentResponse(rejected));
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
      responseNote: responseNote || null,
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
  const token = getSessionTokenFromRequest(req);
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
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const reportId = parseInt(req.params.id);
  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId)).limit(1);

  if (!report[0]) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }
  if (report[0].userId !== user.id) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk menambah tugas laporan harian" });
    return;
  }

  const addTaskError = getAddTaskError(report[0]);
  if (addTaskError) {
    res.status(400).json({ error: addTaskError });
    return;
  }

  const { title, project, deadline, completionInputType, completionValue, status, notes } = req.body;
  const carryForwardSourceTaskId = Number(req.body?.carryForwardSourceTaskId);
  if (!title || !title.trim()) { res.status(400).json({ error: "Nama tugas diperlukan" }); return; }

  const existingReportTasks = await db
    .select()
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, reportId));
  const taskIdentityKey = getTaskIdentityKey({ title, project });
  const duplicateTask = existingReportTasks.find(
    (existingTask) => getTaskIdentityKey(existingTask) === taskIdentityKey,
  );
  const isCarryForward =
    Number.isInteger(carryForwardSourceTaskId) && carryForwardSourceTaskId > 0;
  if (duplicateTask) {
    if (isCarryForward) {
      const existingCarryForwardTask = duplicateTask;
      res.json(buildTaskResponse(existingCarryForwardTask));
      return;
    }

    res.status(409).json({
      error: "Nama tugas dan project yang sama sudah ada pada laporan hari ini.",
    });
    return;
  }

  const requestedStatus = normalizeTaskStatus(status);
  const requestedProgress = getTaskProgress(requestedStatus);
  const highestHistoricalProgress = await getHighestTaskProgressForIdentity(
    report[0].userId,
    report[0].date,
    { title, project },
  );
  if (!isCarryForward && highestHistoricalProgress > requestedProgress) {
    res.status(409).json({
      error: "Tugas dengan nama dan project yang sama sudah pernah memiliki progres lebih tinggi. Gunakan nama tugas berbeda untuk pekerjaan baru.",
    });
    return;
  }
  const normalizedStatus = highestHistoricalProgress > requestedProgress
    ? getStatusForProgress(highestHistoricalProgress)
    : requestedStatus;

  const [task] = await db.insert(dailyTasksTable).values({
    reportId,
    title,
    project: project ?? null,
    deadline: deadline || null,
    completionInputType: completionInputType === "date" ? "date" : completionInputType === "text" ? "text" : null,
    completionValue: completionValue ? String(completionValue).trim() : null,
    progress: getTaskProgress(normalizedStatus),
    status: normalizedStatus,
    notes: notes ?? null,
    carryForwardSourceTaskId: Number.isInteger(carryForwardSourceTaskId) && carryForwardSourceTaskId > 0
      ? carryForwardSourceTaskId
      : null,
  }).returning();

  res.status(201).json(buildTaskResponse(task));
});

router.patch("/tasks/:taskId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const taskId = parseInt(req.params.taskId);
  const task = await db.select().from(dailyTasksTable).where(eq(dailyTasksTable.id, taskId)).limit(1);

  if (!task[0]) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }

  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, task[0].reportId)).limit(1);
  if (!report[0] || (report[0].userId !== user.id && user.role !== "admin")) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk mengedit tugas laporan harian" });
    return;
  }

  const modifyTaskError = getModifyTaskError(report[0], task[0], user);
  if (modifyTaskError) {
    res.status(400).json({ error: modifyTaskError });
    return;
  }

  const { title, project, deadline, completionInputType, completionValue, status, notes } = req.body;

  if (task[0].carryForwardSourceTaskId && (title !== undefined || project !== undefined)) {
    res.status(400).json({ error: "Nama tugas dan project carry-forward tidak bisa diubah" });
    return;
  }

  if (title !== undefined && !String(title).trim()) {
    res.status(400).json({ error: "Nama tugas tidak boleh kosong" });
    return;
  }

  const hasUpdate =
    title !== undefined ||
    project !== undefined ||
    deadline !== undefined ||
    completionInputType !== undefined ||
    completionValue !== undefined ||
    status !== undefined ||
    notes !== undefined;

  if (!hasUpdate) {
    res.status(400).json({ error: "Tidak ada data tugas yang diubah" });
    return;
  }

  if (status !== undefined || title !== undefined || project !== undefined) {
    const requestedProgress = status !== undefined
      ? getTaskProgress(status)
      : task[0].progress;
    const prospectiveTask = {
      title: title !== undefined ? String(title) : task[0].title,
      project: project !== undefined ? String(project ?? "") : task[0].project,
    };
    const highestHistoricalProgress = await getHighestTaskProgressForIdentity(
      report[0].userId,
      report[0].date,
      prospectiveTask,
      task[0].id,
    );

    if (requestedProgress < Math.max(task[0].progress, highestHistoricalProgress)) {
      res.status(409).json({
        error: "Status tugas tidak dapat dimundurkan karena progres yang lebih tinggi sudah pernah tersimpan.",
      });
      return;
    }
  }

  const [updated] = await db.update(dailyTasksTable)
    .set({
      ...(title !== undefined && { title }),
      ...(project !== undefined && { project }),
      ...(deadline !== undefined && { deadline: deadline || null }),
      ...(completionInputType !== undefined && {
        completionInputType:
          completionInputType === "date" || completionInputType === "text"
            ? completionInputType
            : null,
      }),
      ...(completionValue !== undefined && {
        completionValue: String(completionValue ?? "").trim() || null,
      }),
      ...(status !== undefined && {
        status: normalizeTaskStatus(status),
        progress: getTaskProgress(status),
      }),
      ...(notes !== undefined && { notes }),
      editCount: sql`${dailyTasksTable.editCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(dailyTasksTable.id, taskId))
    .returning();

  if (updated.progress >= 100 || ["delivered", "selesai"].includes(updated.status)) {
    await stopCompletedTaskFromFutureCarryForward(updated, report[0]);
  }

  res.json(buildTaskResponse(updated));
});

router.post("/tasks/:taskId/start-correction", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const taskId = parseInt(req.params.taskId);
  const [task] = await db
    .select()
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.id, taskId))
    .limit(1);

  if (!task) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }

  const [report] = await db
    .select()
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.id, task.reportId))
    .limit(1);

  if (!report || report.userId !== user.id) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk membuat revisi laporan harian" });
    return;
  }
  if (task.reviewStatus !== "revisi" || task.revisionWorkTaskId) {
    res.status(400).json({ error: "Anda hanya dapat melakukan revisi 1 kali." });
    return;
  }

  const todayReport = await getOrCreateTodayReport(user);
  const [revisionTask] = await db.insert(dailyTasksTable).values({
    reportId: todayReport.id,
    title: task.title,
    project: task.project,
    deadline: task.deadline,
    completionInputType: task.completionInputType,
    completionValue: task.completionValue,
    progress: task.progress,
    status: task.status,
    notes: task.notes,
    reviewStatus: "sedang_diperbaiki",
    reviewComment: task.reviewComment,
    reviewedByUserId: task.reviewedByUserId,
    reviewedByName: task.reviewedByName,
    reviewedAt: task.reviewedAt,
      revisionSourceTaskId: task.id,
      carryForwardSourceTaskId: null,
  }).returning();

  const [updated] = await db.update(dailyTasksTable).set({
    reviewStatus: "sedang_diperbaiki",
    revisionWorkTaskId: revisionTask.id,
  }).where(eq(dailyTasksTable.id, taskId))
    .returning();

  const reviewSummary = await refreshReportReviewStatus(task.reportId);
  res.json({
    task: buildTaskResponse(updated),
    revisionTask: buildTaskResponse(revisionTask),
    todayReportId: todayReport.id,
    reportStatus: reviewSummary.status,
    revisionCount: reviewSummary.revisionCount,
  });
});

router.post("/tasks/:taskId/submit-correction", async (_req, res) => {
  res.status(410).json({
    error: "Gunakan tombol Perbaiki, lalu submit Laporan Harian hari ini.",
  });
});

router.post("/tasks/:taskId/review", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!(await canEditByPermission(user, "daily_report_review"))) {
    res.status(403).json({ error: "Tidak punya izin untuk review tugas laporan harian" });
    return;
  }

  const taskId = parseInt(req.params.taskId);
  const { action, comment } = req.body as { action?: string; comment?: string };

  const [task] = await db.select().from(dailyTasksTable).where(eq(dailyTasksTable.id, taskId)).limit(1);
  if (!task) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }

  if (action === "revision" && ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")) {
    res.status(400).json({ error: "Tugas ini sudah memiliki revisi aktif" });
    return;
  }

  const reviewStatus =
    action === "review"
      ? task.reviewStatus === "sudah_diperbaiki" ? "selesai" : "direview" :
    action === "revision" ? "revisi" : undefined;
  if (reviewStatus === undefined) {
    res.status(400).json({ error: "Tindakan review tidak valid" });
    return;
  }

  const [updated] = await db.update(dailyTasksTable).set({
    reviewStatus,
    reviewComment: comment?.trim() || null,
    reviewedByUserId: user.id,
    reviewedByName: user.name,
    reviewedAt: new Date(),
    ...(action === "revision"
      ? { correctedAt: null, revisionWorkTaskId: null }
      : {}),
  }).where(eq(dailyTasksTable.id, taskId)).returning();

  const [report] = await db.select().from(dailyReportsTable)
    .where(eq(dailyReportsTable.id, task.reportId)).limit(1);
  const reviewSummary = await refreshReportReviewStatus(task.reportId);

  if (report && action === "revision") {
    const formattedDate = new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
    }).format(new Date(`${report.date}T00:00:00+07:00`));
    const reviewerRole = ["direktur", "director", "dir"].includes(String(user.role).toLowerCase())
      ? "Direktur" : "Admin";
    const notificationData = {
      title: "Revisi Tugas Laporan Harian",
      message: `Laporan Harian Anda pada ${formattedDate} telah mendapat revisi dari ${reviewerRole}.`,
    };
    const [existingNotification] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, report.userId),
          eq(notificationsTable.type, "revision"),
          eq(notificationsTable.relatedReportId, report.id),
          eq(notificationsTable.isRead, false),
        ),
      )
      .limit(1);

    if (existingNotification) {
      await db
        .update(notificationsTable)
        .set({ ...notificationData, createdAt: new Date() })
        .where(eq(notificationsTable.id, existingNotification.id));
    } else {
      await db.insert(notificationsTable).values({
        userId: report.userId,
        ...notificationData,
        type: "revision",
        relatedReportId: report.id,
      });
    }
  }

  res.json({ task: buildTaskResponse(updated), reportStatus: reviewSummary.status, revisionCount: reviewSummary.revisionCount });
});

router.delete("/tasks/:taskId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const taskId = parseInt(req.params.taskId);
  const task = await db.select().from(dailyTasksTable).where(eq(dailyTasksTable.id, taskId)).limit(1);

  if (!task[0]) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }

  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, task[0].reportId)).limit(1);
  if (!report[0] || (report[0].userId !== user.id && user.role !== "admin")) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk menghapus tugas laporan harian" });
    return;
  }

  const modifyTaskError = getModifyTaskError(report[0], task[0], user);
  if (modifyTaskError) {
    res.status(400).json({ error: modifyTaskError });
    return;
  }

  await stopDeletedTaskFromFutureCarryForward(task[0], report[0]);
  await db.delete(dailyTasksTable).where(eq(dailyTasksTable.id, taskId));
  res.json({ success: true, message: "Tugas berhasil dihapus" });
});

export default router;

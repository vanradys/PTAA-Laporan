import { Router } from "express";
import { db, dailyTasksTable, dailyReportsTable, eq, sql } from "@workspace/db";
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
  return deadline < getTodayString();
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

import { Router } from "express";
import { db, dailyTasksTable, dailyReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router = Router();

router.get("/reports/:id/tasks", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const tasks = await db.select().from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, id))
    .orderBy(dailyTasksTable.createdAt);

  res.json(tasks.map(t => ({
    id: t.id, reportId: t.reportId, title: t.title,
    project: t.project ?? null, progress: t.progress, status: t.status,
    notes: t.notes ?? null, createdAt: t.createdAt.toISOString(),
  })));
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

  const { title, project, progress, status, notes } = req.body;
  if (!title) { res.status(400).json({ error: "Nama tugas diperlukan" }); return; }

  const [task] = await db.insert(dailyTasksTable).values({
    reportId,
    title,
    project: project ?? null,
    progress: progress ?? 0,
    status: status ?? "belum_mulai",
    notes: notes ?? null,
  }).returning();

  res.status(201).json({
    id: task.id, reportId: task.reportId, title: task.title,
    project: task.project ?? null, progress: task.progress, status: task.status,
    notes: task.notes ?? null, createdAt: task.createdAt.toISOString(),
  });
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

  const { title, project, progress, status, notes } = req.body;
  const [updated] = await db.update(dailyTasksTable)
    .set({
      ...(title !== undefined && { title }),
      ...(project !== undefined && { project }),
      ...(progress !== undefined && { progress }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    })
    .where(eq(dailyTasksTable.id, taskId))
    .returning();

  res.json({
    id: updated.id, reportId: updated.reportId, title: updated.title,
    project: updated.project ?? null, progress: updated.progress, status: updated.status,
    notes: updated.notes ?? null, createdAt: updated.createdAt.toISOString(),
  });
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

  await db.delete(dailyTasksTable).where(eq(dailyTasksTable.id, taskId));
  res.json({ success: true, message: "Tugas berhasil dihapus" });
});

export default router;

import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router = Router();

router.get("/notifications", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const notifs = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(notificationsTable.createdAt);

  res.json(notifs.map(n => ({
    id: n.id, userId: n.userId, title: n.title, message: n.message,
    isRead: n.isRead, type: n.type,
    relatedReportId: n.relatedReportId ?? null,
    createdAt: n.createdAt.toISOString(),
  })).reverse());
});

router.post("/notifications/:notifId/read", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const notifId = parseInt(req.params.notifId);
  const [updated] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, notifId), eq(notificationsTable.userId, user.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Notifikasi tidak ditemukan" }); return; }

  res.json({
    id: updated.id, userId: updated.userId, title: updated.title, message: updated.message,
    isRead: updated.isRead, type: updated.type,
    relatedReportId: updated.relatedReportId ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/notifications/read-all", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, user.id));

  res.json({ success: true, message: "Semua notifikasi ditandai sudah dibaca" });
});

export default router;

import { and, db, deviceTokensTable, eq, notificationsTable } from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router, type Request, type Response } from "express";

const router = Router();

async function getAuthenticatedUser(req: Request) {
  const token = req.cookies?.session_token;
  if (!token) return null;
  return getUserFromToken(token);
}

function mapNotification(notification: typeof notificationsTable.$inferSelect) {
  return {
    id: notification.id,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    type: notification.type,
    relatedReportId: notification.relatedReportId ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

router.get("/notifications", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(notificationsTable.createdAt);

  res.json(notifications.map(mapNotification).reverse());
});

async function markNotificationRead(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const notificationId = Number(req.params.notifId);
  if (!Number.isInteger(notificationId)) {
    res.status(400).json({ error: "ID notifikasi tidak valid" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Notifikasi tidak ditemukan" }); return; }

  res.json(mapNotification(updated));
}

async function deleteNotification(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const notificationId = Number(req.params.notifId);
  if (!Number.isInteger(notificationId)) {
    res.status(400).json({ error: "ID notifikasi tidak valid" });
    return;
  }

  const deleted = await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)));

  if (!deleted) {
    res.status(404).json({ error: "Notifikasi tidak ditemukan" });
    return;
  }

  res.json({ success: true, message: "Notifikasi berhasil dihapus" });
}

async function markAllNotificationsRead(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, user.id));

  res.json({ success: true, message: "Semua notifikasi ditandai sudah dibaca" });
}

router.patch("/notifications/:notifId/read", markNotificationRead);
router.post("/notifications/:notifId/read", markNotificationRead);
router.delete("/notifications/:notifId", deleteNotification);

router.patch("/notifications/read-all", markAllNotificationsRead);
router.post("/notifications/read-all", markAllNotificationsRead);

router.post("/notifications/register-token", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const token = String(req.body.token ?? "").trim();
  const platform = String(req.body.platform ?? "web").trim() || "web";

  if (!token) {
    res.status(400).json({ error: "Token notifikasi diperlukan" });
    return;
  }

  const existing = await db
    .select({ id: deviceTokensTable.id })
    .from(deviceTokensTable)
    .where(eq(deviceTokensTable.token, token))
    .limit(1);

  if (existing[0]) {
    await db
      .update(deviceTokensTable)
      .set({ userId: user.id, platform })
      .where(eq(deviceTokensTable.id, existing[0].id));
  } else {
    await db.insert(deviceTokensTable).values({ userId: user.id, token, platform });
  }

  res.json({ success: true, message: "Token notifikasi berhasil disimpan" });
});

export default router;

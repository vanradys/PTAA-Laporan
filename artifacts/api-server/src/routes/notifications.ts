import express from "express";
import { and, db, deviceTokensTable, eq, inArray, notificationsTable, sql } from "@workspace/db";
import { getUserFromToken } from "./auth";

const router = (express as any).Router();

async function getAuthenticatedUser(req: any) {
  const token = req.cookies?.session_token;

  if (!token) {
    return null;
  }

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

router.get("/notifications", async (req: any, res: any) => {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const isAdmin = String(user.role ?? "").toLowerCase() === "admin";
  const hiddenNotificationTypes = isAdmin
    ? sql`${notificationsTable.type} not in (
        'report_created',
        'daily_report',
        'po_overdue',
        'po_deadline_7days',
        'po_deadline_14days'
      )`
    : sql`${notificationsTable.type} <> 'report_created'`;

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, user.id),
        hiddenNotificationTypes,
      ),
    )
    .orderBy(notificationsTable.createdAt);

  res.json(notifications.map(mapNotification).reverse());
});

async function markNotificationRead(req: any, res: any) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

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

  if (!updated) {
    res.status(404).json({ error: "Notifikasi tidak ditemukan" });
    return;
  }

  res.json(mapNotification(updated));
}

async function deleteNotification(req: any, res: any) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

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

async function deleteNotificationsBulk(req: any, res: any) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id: unknown) => Number(id)).filter(Number.isInteger)
    : [];

  if (ids.length === 0) {
    res.status(400).json({ error: "Pilih minimal 1 notifikasi" });
    return;
  }

  await db
    .delete(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, user.id),
        inArray(notificationsTable.id, ids),
      ),
    );

  res.json({ success: true, message: "Notifikasi terpilih berhasil dihapus" });
}

async function markAllNotificationsRead(req: any, res: any) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, user.id));

  res.json({ success: true, message: "Semua notifikasi ditandai sudah dibaca" });
}

router.patch("/notifications/:notifId/read", markNotificationRead);
router.post("/notifications/:notifId/read", markNotificationRead);
router.delete("/notifications/:notifId", deleteNotification);
router.post("/notifications/bulk-delete", deleteNotificationsBulk);
router.delete("/notifications", deleteNotificationsBulk);

router.patch("/notifications/read-all", markAllNotificationsRead);
router.post("/notifications/read-all", markAllNotificationsRead);

router.post("/notifications/register-token", async (req: any, res: any) => {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

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

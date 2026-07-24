import express from "express";
import { and, dailyReportsTable, db, deviceTokensTable, eq, inArray, notificationsTable, or, sql } from "@workspace/db";
import { getSessionTokenFromRequest, getUserFromToken } from "./auth";

const router = (express as any).Router();

async function getAuthenticatedUser(req: any) {
  const token = getSessionTokenFromRequest(req);

  if (!token) {
    return null;
  }

  return getUserFromToken(token);
}

function parseReportCommentDate(message: string) {
  const isoMatch = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];
  const slashMatch = message.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch?.[1] && slashMatch[2] && slashMatch[3]) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }
  return null;
}

async function mapNotifications(notifications: Array<typeof notificationsTable.$inferSelect>) {
  const unresolvedReportCommentDates = notifications
    .filter((notification) =>
      notification.type === "report_comment" &&
      !notification.relatedReportId &&
      parseReportCommentDate(notification.message),
    )
    .map((notification) => ({
      userId: notification.userId,
      date: parseReportCommentDate(notification.message) as string,
    }));

  const reportTargetByKey = new Map<string, number>();
  if (unresolvedReportCommentDates.length > 0) {
    const targetReports = await db
      .select({
        id: dailyReportsTable.id,
        userId: dailyReportsTable.userId,
        date: dailyReportsTable.date,
      })
      .from(dailyReportsTable)
      .where(or(...unresolvedReportCommentDates.map((item) =>
        and(eq(dailyReportsTable.userId, item.userId), eq(dailyReportsTable.date, item.date)),
      )));

    targetReports.forEach((report) => {
      reportTargetByKey.set(`${report.userId}|${report.date}`, report.id);
    });
  }

  return notifications.map((notification) => {
    const fallbackDate = parseReportCommentDate(notification.message);
    const fallbackReportId = fallbackDate
      ? reportTargetByKey.get(`${notification.userId}|${fallbackDate}`) ?? null
      : null;

    return mapNotification(notification, fallbackReportId);
  });
}

function mapNotification(notification: typeof notificationsTable.$inferSelect, fallbackReportId: number | null = null) {
  return {
    id: notification.id,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    type: notification.type,
    relatedReportId: notification.relatedReportId ?? fallbackReportId,
    relatedTodoId: notification.relatedTodoId ?? null,
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

  res.json((await mapNotifications(notifications)).reverse());
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

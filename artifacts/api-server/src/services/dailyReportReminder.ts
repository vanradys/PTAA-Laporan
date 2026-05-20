import {
  db,
  dailyReportReminderLogsTable,
  dailyReportsTable,
  departmentsTable,
  notificationsTable,
  usersTable,
  REMOVED_USER_EMAILS,
  and,
  eq,
  notInArray,
  sql,
  type SQL,
} from "@workspace/db";
import { sendPushNotificationToUser } from "./pushNotification";

const REMINDER_TITLE = "Reminder Laporan Harian";
const REMINDER_TYPE = "daily_report";
const FULL_ACCESS_ROLES = ["admin", "hr", "direktur", "director"];
const DEPARTMENT_LEADER_ROLES = ["atasan", "leader", "supervisor", "spv", "manager", "kepala_departemen"];

export interface ReminderActor {
  id: number;
  role: string;
  departmentId: number | null;
}

export interface MissingDailyReportUser {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  reportDate: string;
  status: "Belum Mengisi";
  reminderSent: boolean;
  reminderSentAt: string | null;
}

interface ReminderScope {
  departmentId?: number;
}

export function getJakartaDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Gagal membuat tanggal WIB");
  }

  return `${year}-${month}-${day}`;
}

export function formatIndonesianDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!year || !month || !day) {
    return dateString;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function normalizeReportDate(value: unknown): string {
  const date = typeof value === "string" ? value.trim() : "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  return getJakartaDateString();
}

export function getReminderActorLabel(role: string): string {
  const normalizedRole = role.toLowerCase();

  if (normalizedRole === "hr") return "HR";
  if (normalizedRole === "admin") return "Admin";
  if (normalizedRole === "direktur" || normalizedRole === "director") return "Direktur";

  if (DEPARTMENT_LEADER_ROLES.includes(normalizedRole)) {
    return "Atasan";
  }

  return "Admin";
}

export function buildReminderMessage(actorLabel: string, reportDate: string): string {
  return `${actorLabel} telah mengirim anda reminder untuk mengisi laporan harian tanggal ${formatIndonesianDate(reportDate)}.`;
}

export function canManageDailyReportReminder(actor: ReminderActor): boolean {
  const role = actor.role.toLowerCase();
  return FULL_ACCESS_ROLES.includes(role) || DEPARTMENT_LEADER_ROLES.includes(role);
}

export function getReminderScope(actor: ReminderActor): ReminderScope {
  const role = actor.role.toLowerCase();

  if (FULL_ACCESS_ROLES.includes(role)) {
    return {};
  }

  if (DEPARTMENT_LEADER_ROLES.includes(role) && actor.departmentId) {
    return { departmentId: actor.departmentId };
  }

  return { departmentId: -1 };
}

function activeUserCondition(): SQL {
  return and(sql`${usersTable.isActive} is distinct from false`, notInArray(usersTable.email, [...REMOVED_USER_EMAILS])) as SQL;
}

function submittedReportCondition(reportDate: string): SQL {
  return and(
    eq(dailyReportsTable.date, reportDate),
    sql`${dailyReportsTable.status} <> 'draf'`,
  ) as SQL;
}

export async function getMissingDailyReportUsers(
  scope: ReminderScope = {},
  reportDate = getJakartaDateString(),
): Promise<MissingDailyReportUser[]> {
  const userConditions: SQL[] = [activeUserCondition()];

  if (scope.departmentId !== undefined) {
    userConditions.push(eq(usersTable.departmentId, scope.departmentId));
  }

  const activeUsers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(and(...userConditions))
    .orderBy(usersTable.name);

  if (activeUsers.length === 0) {
    return [];
  }

  const activeUserIds = new Set(activeUsers.map((user) => user.id));

  const submittedReports = await db
    .select({ userId: dailyReportsTable.userId })
    .from(dailyReportsTable)
    .where(submittedReportCondition(reportDate));

  const reminderLogs = await db
    .select({
      userId: dailyReportReminderLogsTable.userId,
      sentAt: dailyReportReminderLogsTable.sentAt,
    })
    .from(dailyReportReminderLogsTable)
    .where(
      and(
        eq(dailyReportReminderLogsTable.reportDate, reportDate),
        eq(dailyReportReminderLogsTable.reminderType, REMINDER_TYPE),
      ),
    );

  const submittedUserIds = new Set(
    submittedReports
      .filter((report) => activeUserIds.has(report.userId))
      .map((report) => report.userId),
  );
  const reminderLogByUserId = new Map(
    reminderLogs.map((log) => [log.userId, log.sentAt instanceof Date ? log.sentAt.toISOString() : String(log.sentAt)]),
  );

  return activeUsers
    .filter((user) => !submittedUserIds.has(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId ?? null,
      departmentName: user.departmentName ?? null,
      reportDate,
      status: "Belum Mengisi",
      reminderSent: reminderLogByUserId.has(user.id),
      reminderSentAt: reminderLogByUserId.get(user.id) ?? null,
    }));
}

export async function sendDailyReportReminders(options: {
  sentBy: number | null;
  actorLabel?: string;
  scope?: ReminderScope;
  reportDate?: string;
}) {
  const reportDate = options.reportDate ?? getJakartaDateString();
  const actorLabel = options.actorLabel ?? "Sistem";
  const reminderMessage = buildReminderMessage(actorLabel, reportDate);
  const missingUsers = await getMissingDailyReportUsers(options.scope ?? {}, reportDate);
  const targetUsers = missingUsers.filter((user) => !user.reminderSent);
  const sentUsers: MissingDailyReportUser[] = [];
  let pushSuccessCount = 0;
  let pushFailedCount = 0;
  let pushInvalidTokenRemovedCount = 0;

  for (const user of targetUsers) {
    const didSend = await db.transaction(async (tx) => {
      const insertedLog = await tx
        .insert(dailyReportReminderLogsTable)
        .values({
          userId: user.id,
          reportDate,
          reminderType: REMINDER_TYPE,
          sentBy: options.sentBy,
        })
        .onConflictDoNothing()
        .returning({ id: dailyReportReminderLogsTable.id });

      if (!insertedLog[0]) {
        return false;
      }

      await tx.insert(notificationsTable).values({
        userId: user.id,
        title: REMINDER_TITLE,
        message: reminderMessage,
        type: REMINDER_TYPE,
      });

      return true;
    });

    if (didSend) {
      sentUsers.push({ ...user, reminderSent: true, reminderSentAt: new Date().toISOString() });

      const pushResult = await sendPushNotificationToUser({
        userId: user.id,
        title: REMINDER_TITLE,
        message: reminderMessage,
        type: REMINDER_TYPE,
        url: "/notifikasi",
      });

      pushSuccessCount += pushResult.successCount;
      pushFailedCount += pushResult.failedCount;
      pushInvalidTokenRemovedCount += pushResult.removedInvalidTokenCount;
    }
  }

  return {
    success: true,
    reportDate,
    sentCount: sentUsers.length,
    skippedCount: missingUsers.length - sentUsers.length,
    totalMissing: missingUsers.length,
    sentUsers,
    pushSuccessCount,
    pushFailedCount,
    pushInvalidTokenRemovedCount,
    message: sentUsers.length > 0
      ? `Reminder berhasil dikirim ke ${sentUsers.length} karyawan.`
      : missingUsers.length > 0
        ? `Reminder tanggal ${formatIndonesianDate(reportDate)} sudah pernah dikirim ke semua karyawan yang belum mengisi.`
        : `Semua karyawan sudah mengisi laporan harian tanggal ${formatIndonesianDate(reportDate)}.`,
  };
}

import {
  db,
  dailyReportReminderLogsTable,
  dailyReportsTable,
  departmentsTable,
  notificationsTable,
  usersTable,
  and,
  eq,
  notInArray,
  type SQL,
} from "@workspace/db";
import { sendPushNotificationToUser } from "./pushNotification";

const REMINDER_TITLE = "Reminder Laporan Harian";
const REMINDER_MESSAGE = "Anda belum mengisi laporan harian hari ini. Silakan isi laporan sebelum jam kerja selesai.";
const REMINDER_TYPE = "daily_report";
const EXCLUDED_DAILY_REPORT_ROLES = ["admin", "direktur", "director"];
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

export function canManageDailyReportReminder(actor: ReminderActor): boolean {
  return FULL_ACCESS_ROLES.includes(actor.role) || DEPARTMENT_LEADER_ROLES.includes(actor.role);
}

export function getReminderScope(actor: ReminderActor): ReminderScope {
  if (FULL_ACCESS_ROLES.includes(actor.role)) {
    return {};
  }

  if (DEPARTMENT_LEADER_ROLES.includes(actor.role) && actor.departmentId) {
    return { departmentId: actor.departmentId };
  }

  return { departmentId: -1 };
}

export async function getMissingDailyReportUsers(scope: ReminderScope = {}, reportDate = getJakartaDateString()): Promise<MissingDailyReportUser[]> {
  const conditions: SQL[] = [
    eq(usersTable.isActive, true),
    notInArray(usersTable.role, EXCLUDED_DAILY_REPORT_ROLES),
  ];

  if (scope.departmentId !== undefined) {
    conditions.push(eq(usersTable.departmentId, scope.departmentId));
  }

  const users = await db
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
    .where(and(...conditions))
    .orderBy(usersTable.name);

  const reportsToday = await db
    .select({ userId: dailyReportsTable.userId })
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.date, reportDate));

  const logsToday = await db
    .select({ userId: dailyReportReminderLogsTable.userId })
    .from(dailyReportReminderLogsTable)
    .where(
      and(
        eq(dailyReportReminderLogsTable.reportDate, reportDate),
        eq(dailyReportReminderLogsTable.reminderType, REMINDER_TYPE),
      ),
    );

  const usersWithReport = new Set(reportsToday.map((report) => report.userId));
  const usersWithReminder = new Set(logsToday.map((log) => log.userId));

  return users
    .filter((user) => !usersWithReport.has(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId ?? null,
      departmentName: user.departmentName ?? null,
      reportDate,
      status: "Belum Mengisi",
      reminderSent: usersWithReminder.has(user.id),
    }));
}

export async function sendDailyReportReminders(options: {
  sentBy: number | null;
  scope?: ReminderScope;
  reportDate?: string;
}) {
  const reportDate = options.reportDate ?? getJakartaDateString();
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
        message: REMINDER_MESSAGE,
        type: REMINDER_TYPE,
      });

      return true;
    });

    if (didSend) {
      sentUsers.push(user);

      const pushResult = await sendPushNotificationToUser({
        userId: user.id,
        title: REMINDER_TITLE,
        message: REMINDER_MESSAGE,
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
      ? `Reminder berhasil dikirim ke ${sentUsers.length} user.`
      : "Tidak ada reminder baru yang perlu dikirim.",
  };
}

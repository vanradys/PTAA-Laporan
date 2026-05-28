import {
  db,
  dailyReportReminderLogsTable,
  dailyReportsTable,
  departmentsTable,
  notificationsTable,
  usersTable,
  and,
  eq,
  sql,
  type SQL,
} from "@workspace/db";
import { sendPushNotificationToUser } from "./pushNotification";

const REMINDER_TITLE = "Reminder Laporan Harian";
const REMINDER_TYPE = "daily_report";
const REMINDER_MESSAGE = "Anda belum mengisi laporan harian hari ini. Silakan segera mengisi laporan.";
const FULL_ACCESS_ROLES = ["admin", "hr", "direktur", "director"];
const DEPARTMENT_LEADER_ROLES = ["atasan", "leader", "supervisor", "spv", "manager", "kepala_departemen"];
const REMOVED_USER_EMAILS = [
  "admin@ptaa.com",
  "ahmad@perusahaan.com",
  "budi@perusahaan.com",
  "eko@perusahaan.com",
  "engineering3@adiyasa.com",
  "mkspec@adiyasa.com",
];

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
  reminderStatusText: string | null;
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

export function formatJakartaTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(".", ":");
}

export function normalizeReportDate(value: unknown): string {
  const date = typeof value === "string" ? value.trim() : "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  return getJakartaDateString();
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

export function activeUserCondition(): SQL {
  return sql`${usersTable.isActive} is distinct from false`;
}

export function reportingUserCondition(): SQL {
  return sql`
    ${usersTable.isActive} is distinct from false
    and lower(${usersTable.role}) not in ('admin', 'hr', 'direktur', 'director')
    and lower(${usersTable.email}) not in (
      'admin@ptaa.com',
      'ahmad@perusahaan.com',
      'budi@perusahaan.com',
      'eko@perusahaan.com',
      'engineering3@adiyasa.com',
      'mkspec@adiyasa.com',
      'hr@adiyasa.com'
    )
  `;
}

export function submittedReportCondition(reportDate: string): SQL {
  return and(
    eq(dailyReportsTable.date, reportDate),
    sql`lower(${dailyReportsTable.status}) not in ('draf', 'belum_submit')`,
  ) as SQL;
}

export function isSubmittedReportStatus(status: string | null | undefined): boolean {
  const normalizedStatus = String(status ?? "").toLowerCase();
  return normalizedStatus.length > 0 && !["draf", "belum_submit"].includes(normalizedStatus);
}

export async function getMissingDailyReportUsers(
  scope: ReminderScope = {},
  reportDate = getJakartaDateString(),
): Promise<MissingDailyReportUser[]> {
  const userConditions: SQL[] = [reportingUserCondition()];

  if (scope.departmentId !== undefined) {
    userConditions.push(eq(usersTable.departmentId, scope.departmentId));
  }

  const reportingUsers = await db
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

  if (reportingUsers.length === 0) {
    return [];
  }

  const reportingUserIds = new Set(reportingUsers.map((user) => user.id));

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
      .filter((report) => reportingUserIds.has(report.userId))
      .map((report) => report.userId),
  );

  const reminderLogByUserId = new Map<number, Date>();
  for (const log of reminderLogs) {
    if (!reminderLogByUserId.has(log.userId)) {
      reminderLogByUserId.set(log.userId, log.sentAt);
    }
  }

  return reportingUsers
    .filter((user) => !submittedUserIds.has(user.id))
    .map((user) => {
      const sentAt = reminderLogByUserId.get(user.id) ?? null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId ?? null,
        departmentName: user.departmentName ?? null,
        reportDate,
        status: "Belum Mengisi",
        reminderSent: !!sentAt,
        reminderSentAt: sentAt ? sentAt.toISOString() : null,
        reminderStatusText: sentAt ? `Sudah dikirim pada pukul ${formatJakartaTime(sentAt)}` : null,
      };
    });
}

async function createInAppReminderNotification(options: {
  userId: number;
  sentBy: number | null;
  reportDate: string;
}) {
  const insertedLog = await db
    .insert(dailyReportReminderLogsTable)
    .values({
      userId: options.userId,
      reportDate: options.reportDate,
      reminderType: REMINDER_TYPE,
      sentBy: options.sentBy,
    })
    .onConflictDoNothing()
    .returning({ sentAt: dailyReportReminderLogsTable.sentAt });

  const sentAt = insertedLog[0]?.sentAt ?? null;

  if (!sentAt) {
    return null;
  }

  await db.insert(notificationsTable).values({
    userId: options.userId,
    title: REMINDER_TITLE,
    message: REMINDER_MESSAGE,
    type: REMINDER_TYPE,
  });

  return sentAt;
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
    const insertedSentAt = await createInAppReminderNotification({
      userId: user.id,
      sentBy: options.sentBy,
      reportDate,
    });

    if (!insertedSentAt) {
      continue;
    }

    sentUsers.push({
      ...user,
      reminderSent: true,
      reminderSentAt: insertedSentAt.toISOString(),
      reminderStatusText: `Sudah dikirim pada pukul ${formatJakartaTime(insertedSentAt)}`,
    });

    try {
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
    } catch (error) {
      pushFailedCount += 1;
      console.warn("Push notification gagal, tetapi in-app notification tetap tersimpan:", error);
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
        : `Semua karyawan wajib laporan sudah mengisi laporan harian tanggal ${formatIndonesianDate(reportDate)}.`,
  };
}

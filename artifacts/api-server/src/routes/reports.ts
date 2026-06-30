import {
  and,
  db,
  dailyReportsTable,
  dailyTasksTable,
  departmentsTable,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  notificationsTable,
  or,
  reportCommentsTable,
  sql,
  usersTable,
  type SQL,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router } from "express";
import { alias } from "drizzle-orm/pg-core";
import {
  getPreviousRequiredReportDate,
  isSubmittedReportStatus,
  isWeekendReportDate,
  reportingUserCondition,
} from "../services/dailyReportReminder";
import { canEditByPermission } from "../services/editPermissions";

const router = Router();
const reportOwnerUsersTable = alias(usersTable, "report_owner");
const reportCommenterUsersTable = alias(usersTable, "report_commenter");

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
let dailyReportsSchemaReady: Promise<void> | null = null;

function ensureDailyReportsSchema() {
  dailyReportsSchemaReady ??= (async () => {
    const submittedAtColumn = await db.execute(sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'daily_reports'
        and column_name = 'submitted_at'
      limit 1
    `);
    const columnRows =
      (submittedAtColumn as unknown as { rows?: unknown[] }).rows ??
      (submittedAtColumn as unknown as unknown[]);

    if (columnRows.length === 0) {
      await db.execute(sql`
        alter table daily_reports
        add column submitted_at timestamp with time zone
      `);
    }

    await db.execute(sql`
      update daily_reports
      set submitted_at = updated_at
      where submitted_at is null
        and status in ('dikirim', 'direview', 'perlu_revisi')
    `);
  })();

  return dailyReportsSchemaReady.catch((error) => {
    dailyReportsSchemaReady = null;
    throw error;
  });
}

router.use(async (_req, res, next) => {
  try {
    await ensureDailyReportsSchema();
    next();
  } catch (error) {
    res.status(500).json({
      error: "Gagal memastikan struktur tabel laporan harian",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

function getJakartaDateString(date = new Date()): string {
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
    return date.toISOString().split("T")[0];
  }

  return `${year}-${month}-${day}`;
}

function activeUserCondition(): SQL {
  return reportingUserCondition();
}

function getDayName(date: string): string {
  return DAY_NAMES[new Date(date + "T00:00:00").getDay()] ?? "-";
}

function isSubmittedStatus(status: string): boolean {
  return isSubmittedReportStatus(status);
}

function isReportCommentManager(user: { role?: string | null }) {
  return ["admin", "direktur", "director", "dir", "monitoring_dummy"].includes(
    String(user.role ?? "").toLowerCase(),
  );
}

function isReportLocked(status: string): boolean {
  return ["dikirim", "direview"].includes(status);
}

function isEmptyText(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

const MAX_TASK_ACTIONS = 2;

function getTodayString(): string {
  return getJakartaDateString();
}

function getRemainingActions(editCount: number): number {
  return Math.max(0, MAX_TASK_ACTIONS - editCount);
}

function isTaskLockedByCount(editCount: number): boolean {
  return getRemainingActions(editCount) <= 0;
}

function isTaskDelay(deadline: string | null, status: string): boolean {
  if (!deadline) return false;
  if (["selesai", "delivered"].includes(status)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
  return deadline < getTodayString();
}

function getMonitoringReviewStatus(
  storedStatus: string,
  revisionCount: number,
  correctedCount: number,
  reviewedCount: number,
): string {
  if (revisionCount > 0) return `${revisionCount} Revisi`;
  if (correctedCount > 0) return "Selesai";
  if (reviewedCount > 0) return "Direview";
  return storedStatus;
}

function getTaskIdentityKey(task: { title: string; project?: string | null }) {
  return `${String(task.project ?? "").trim()}|${task.title.trim()}`;
}

function getLatestTasksByProjectTitle<T extends {
  title: string;
  project?: string | null;
  reportDate?: string | null;
  createdAt: Date;
  updatedAt: Date;
}>(tasks: T[]) {
  const latestByKey = new Map<string, T>();

  for (const task of tasks) {
    const key = getTaskIdentityKey(task);
    const current = latestByKey.get(key);
    if (!current) {
      latestByKey.set(key, task);
      continue;
    }

    const taskDate = task.reportDate ?? "";
    const currentDate = current.reportDate ?? "";
    if (
      taskDate > currentDate ||
      (taskDate === currentDate && task.updatedAt.getTime() > current.updatedAt.getTime()) ||
      (taskDate === currentDate && task.updatedAt.getTime() === current.updatedAt.getTime() && task.createdAt.getTime() > current.createdAt.getTime())
    ) {
      latestByKey.set(key, task);
    }
  }

  return Array.from(latestByKey.values());
}

async function copyUnfinishedPreviousTasksToReport(userId: number, reportId: number, reportDate: string) {
  const [sourceReport] = await db
    .select({ id: dailyReportsTable.id, date: dailyReportsTable.date })
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, userId), sql`${dailyReportsTable.date} < ${reportDate}`))
    .orderBy(desc(dailyReportsTable.date), desc(dailyReportsTable.createdAt))
    .limit(1);

  if (!sourceReport) return 0;

  const sourceTasks = await db
    .select()
    .from(dailyTasksTable)
    .where(and(
      eq(dailyTasksTable.reportId, sourceReport.id),
      sql`lower(${dailyTasksTable.status}) not in ('selesai', 'delivered')`,
    ));

  if (sourceTasks.length === 0) return 0;

  const targetTasks = await db
    .select({ title: dailyTasksTable.title, project: dailyTasksTable.project })
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, reportId));
  const existingKeys = new Set(targetTasks.map(getTaskIdentityKey));
  const tasksToCopy = sourceTasks.filter((task) => {
    if (!task.title.trim()) return false;
    const key = getTaskIdentityKey(task);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  if (tasksToCopy.length === 0) return 0;

  await db.insert(dailyTasksTable).values(tasksToCopy.map((task) => ({
    reportId,
    title: task.title,
    project: task.project ?? null,
    deadline: task.deadline ?? null,
    completionInputType: task.completionInputType ?? null,
    completionValue: task.completionValue ?? null,
    progress: task.progress,
    status: task.status,
    notes: task.notes ?? null,
    carryForwardSourceTaskId: task.id,
  })));

  return tasksToCopy.length;
}

async function buildReportDetail(reportId: number) {
  const reports = await db
    .select({
      id: dailyReportsTable.id,
      userId: dailyReportsTable.userId,
      departmentId: dailyReportsTable.departmentId,
      date: dailyReportsTable.date,
      obstacles: dailyReportsTable.obstacles,
      additionalNotes: dailyReportsTable.additionalNotes,
      tomorrowPlan: dailyReportsTable.tomorrowPlan,
      status: dailyReportsTable.status,
      submittedAt: dailyReportsTable.submittedAt,
      createdAt: dailyReportsTable.createdAt,
      updatedAt: dailyReportsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      departmentName: departmentsTable.name,
    })
    .from(dailyReportsTable)
    .leftJoin(usersTable, eq(dailyReportsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(dailyReportsTable.departmentId, departmentsTable.id))
    .where(eq(dailyReportsTable.id, reportId))
    .limit(1);

  if (!reports[0]) return null;
  const r = reports[0];

  const tasks = await db
    .select()
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, reportId))
    .orderBy(dailyTasksTable.createdAt);

  const comments = await db
    .select({
      id: reportCommentsTable.id,
      reportId: reportCommentsTable.reportId,
      userId: reportCommentsTable.userId,
      comment: reportCommentsTable.comment,
      createdAt: reportCommentsTable.createdAt,
      userName: usersTable.name,
      userRole: usersTable.role,
    })
    .from(reportCommentsTable)
    .leftJoin(usersTable, eq(reportCommentsTable.userId, usersTable.id))
    .where(eq(reportCommentsTable.reportId, reportId))
    .orderBy(reportCommentsTable.createdAt);

  const dateObj = new Date(r.date + "T00:00:00");
  const dayName = DAY_NAMES[dateObj.getDay()];
  const avgProgress = tasks.length > 0
    ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
    : 0;

  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName ?? "",
    userEmail: r.userEmail ?? "",
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentName ?? null,
    date: r.date,
    dayName,
    obstacles: r.obstacles ?? null,
    additionalNotes: r.additionalNotes ?? null,
    tomorrowPlan: r.tomorrowPlan ?? null,
    status: getMonitoringReviewStatus(
      r.status,
      tasks.filter((task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")).length,
      tasks.filter((task) => ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? "")).length,
      tasks.filter((task) => task.reviewStatus === "direview").length,
    ),
    storedStatus: r.status,
    revisionCount: tasks.filter((task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")).length,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    tasks: tasks.map(t => {
      const editCount = t.editCount ?? 0;

      return {
        id: t.id,
        reportId: t.reportId,
        title: t.title,
        project: t.project ?? null,
        deadline: t.deadline ?? null,
        completionInputType: t.completionInputType ?? null,
        completionValue: t.completionValue ?? null,
        progress: t.progress,
        status: t.status,
        notes: t.notes ?? null,
        reviewStatus: t.reviewStatus ?? null,
        reviewComment: t.reviewComment ?? null,
        reviewedByUserId: t.reviewedByUserId ?? null,
        reviewedByName: t.reviewedByName ?? null,
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        correctedAt: t.correctedAt?.toISOString() ?? null,
        revisionSourceTaskId: t.revisionSourceTaskId ?? null,
        revisionWorkTaskId: t.revisionWorkTaskId ?? null,
        carryForwardSourceTaskId: t.carryForwardSourceTaskId ?? null,
        reportDate: r.date,
        editCount,
        remainingActions: getRemainingActions(editCount),
        isLocked: isTaskLockedByCount(editCount),
        isDelay: isTaskDelay(t.deadline, t.status),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    }),
    comments: comments.map(c => ({
      id: c.id, reportId: c.reportId, userId: c.userId,
      userName: c.userName ?? "", userRole: c.userRole ?? "",
      comment: c.comment, createdAt: c.createdAt.toISOString(),
    })),
    taskCount: tasks.length,
    avgProgress,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function buildPeriodReportDetail(userId: number, dateFrom: string, dateTo: string) {
  const reports = await db
    .select({
      id: dailyReportsTable.id,
      userId: dailyReportsTable.userId,
      departmentId: dailyReportsTable.departmentId,
      date: dailyReportsTable.date,
      obstacles: dailyReportsTable.obstacles,
      additionalNotes: dailyReportsTable.additionalNotes,
      tomorrowPlan: dailyReportsTable.tomorrowPlan,
      status: dailyReportsTable.status,
      submittedAt: dailyReportsTable.submittedAt,
      createdAt: dailyReportsTable.createdAt,
      updatedAt: dailyReportsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      departmentName: departmentsTable.name,
    })
    .from(dailyReportsTable)
    .leftJoin(usersTable, eq(dailyReportsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(dailyReportsTable.departmentId, departmentsTable.id))
    .where(and(
      eq(dailyReportsTable.userId, userId),
      gte(dailyReportsTable.date, dateFrom),
      lte(dailyReportsTable.date, dateTo),
    ))
    .orderBy(dailyReportsTable.date, dailyReportsTable.createdAt);

  if (!reports.length) return null;

  const reportIds = reports.map((report) => report.id);
  const tasks = await db
    .select({
      id: dailyTasksTable.id,
      reportId: dailyTasksTable.reportId,
      title: dailyTasksTable.title,
      project: dailyTasksTable.project,
      deadline: dailyTasksTable.deadline,
      completionInputType: dailyTasksTable.completionInputType,
      completionValue: dailyTasksTable.completionValue,
      progress: dailyTasksTable.progress,
      status: dailyTasksTable.status,
      notes: dailyTasksTable.notes,
      reviewStatus: dailyTasksTable.reviewStatus,
      reviewComment: dailyTasksTable.reviewComment,
      reviewedByUserId: dailyTasksTable.reviewedByUserId,
      reviewedByName: dailyTasksTable.reviewedByName,
      reviewedAt: dailyTasksTable.reviewedAt,
      correctedAt: dailyTasksTable.correctedAt,
      revisionSourceTaskId: dailyTasksTable.revisionSourceTaskId,
      revisionWorkTaskId: dailyTasksTable.revisionWorkTaskId,
      editCount: dailyTasksTable.editCount,
      createdAt: dailyTasksTable.createdAt,
      updatedAt: dailyTasksTable.updatedAt,
      reportDate: dailyReportsTable.date,
    })
    .from(dailyTasksTable)
    .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
    .where(inArray(dailyTasksTable.reportId, reportIds))
    .orderBy(dailyReportsTable.date, dailyTasksTable.createdAt);

  const comments = await db
    .select({
      id: reportCommentsTable.id,
      reportId: reportCommentsTable.reportId,
      userId: reportCommentsTable.userId,
      comment: reportCommentsTable.comment,
      createdAt: reportCommentsTable.createdAt,
      userName: usersTable.name,
      userRole: usersTable.role,
    })
    .from(reportCommentsTable)
    .leftJoin(usersTable, eq(reportCommentsTable.userId, usersTable.id))
    .where(inArray(reportCommentsTable.reportId, reportIds))
    .orderBy(reportCommentsTable.createdAt);

  const latestTasks = getLatestTasksByProjectTitle(tasks);
  const revisionCount = latestTasks.filter((task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")).length;
  const correctedCount = latestTasks.filter((task) => ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? "")).length;
  const reviewedCount = latestTasks.filter((task) => task.reviewStatus === "direview").length;
  const avgProgress = latestTasks.length > 0
    ? Math.round(latestTasks.reduce((sum, task) => sum + task.progress, 0) / latestTasks.length)
    : 0;
  const latestReport = reports[reports.length - 1];

  return {
    id: latestReport.id,
    userId: latestReport.userId,
    userName: latestReport.userName ?? "",
    userEmail: latestReport.userEmail ?? "",
    departmentId: latestReport.departmentId ?? null,
    departmentName: latestReport.departmentName ?? null,
    date: `${dateFrom} s/d ${dateTo}`,
    dayName: "Periode",
    periodStartDate: dateFrom,
    periodEndDate: dateTo,
    reportIds,
    obstacles: reports.map((report) => report.obstacles).filter(Boolean).join("\n") || null,
    additionalNotes: reports.map((report) => report.additionalNotes).filter(Boolean).join("\n") || null,
    tomorrowPlan: reports.map((report) => report.tomorrowPlan).filter(Boolean).join("\n") || null,
    status: getMonitoringReviewStatus(latestReport.status, revisionCount, correctedCount, reviewedCount),
    storedStatus: latestReport.status,
    revisionCount,
    submittedAt: latestReport.submittedAt ? latestReport.submittedAt.toISOString() : null,
    tasks: latestTasks.map((task) => {
      const editCount = task.editCount ?? 0;

      return {
        id: task.id,
        reportId: task.reportId,
        reportDate: task.reportDate,
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
        editCount,
        remainingActions: getRemainingActions(editCount),
        isLocked: isTaskLockedByCount(editCount),
        isDelay: isTaskDelay(task.deadline, task.status),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
    }),
    comments: comments.map((comment) => ({
      id: comment.id,
      reportId: comment.reportId,
      userId: comment.userId,
      userName: comment.userName ?? "",
      userRole: comment.userRole ?? "",
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
    })),
    taskCount: latestTasks.length,
    avgProgress,
    createdAt: reports[0].createdAt.toISOString(),
    updatedAt: latestReport.updatedAt.toISOString(),
  };
}

router.get("/reports", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const { date, dateFrom, dateTo, month, year, departmentId, userId, status, search } = req.query as Record<string, string>;

  if (date) {
    if (isWeekendReportDate(date)) {
      res.json([]);
      return;
    }

    const userConditions: SQL[] = [activeUserCondition()];

    if (departmentId) userConditions.push(eq(usersTable.departmentId, parseInt(departmentId)));
    if (userId) userConditions.push(eq(usersTable.id, parseInt(userId)));
    if (search) userConditions.push(ilike(usersTable.name, `%${search}%`));

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
      res.json([]);
      return;
    }

    const activeUserIds = activeUsers.map((item) => item.id);
    const reportsToday = await db
      .select({
        id: dailyReportsTable.id,
        userId: dailyReportsTable.userId,
        departmentId: dailyReportsTable.departmentId,
        date: dailyReportsTable.date,
        status: dailyReportsTable.status,
        submittedAt: dailyReportsTable.submittedAt,
        createdAt: dailyReportsTable.createdAt,
      })
      .from(dailyReportsTable)
      .where(and(eq(dailyReportsTable.date, date), inArray(dailyReportsTable.userId, activeUserIds)))
      .orderBy(desc(dailyReportsTable.createdAt));

    const reportByUser = new Map<number, (typeof reportsToday)[number]>();
    for (const report of reportsToday) {
      if (!reportByUser.has(report.userId)) {
        reportByUser.set(report.userId, report);
      }
    }

    const reportIds = reportsToday.map((report) => report.id);
    let tasksByReport: Record<number, { count: number; avg: number; revisions: number; corrected: number; reviewed: number }> = {};

    if (reportIds.length > 0) {
      const taskStats = await db
        .select({
          reportId: dailyTasksTable.reportId,
          count: sql<number>`count(*)::int`,
          avg: sql<number>`coalesce(avg(${dailyTasksTable.progress}), 0)::int`,
          revisions: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} in ('revisi', 'sedang_diperbaiki'))::int`,
          corrected: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} in ('sudah_diperbaiki', 'selesai'))::int`,
          reviewed: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} = 'direview')::int`,
        })
        .from(dailyTasksTable)
        .where(inArray(dailyTasksTable.reportId, reportIds))
        .groupBy(dailyTasksTable.reportId);

      tasksByReport = Object.fromEntries(taskStats.map((item) => [item.reportId, item]));
    }

    const rows = activeUsers
      .map((activeUser) => {
        const report = reportByUser.get(activeUser.id);
        const rowStatus = report?.status ?? "belum_submit";
        const stats = report
          ? tasksByReport[report.id] ?? { count: 0, avg: 0, revisions: 0, corrected: 0, reviewed: 0 }
          : { count: 0, avg: 0, revisions: 0, corrected: 0, reviewed: 0 };
        const displayStatus = report
          ? getMonitoringReviewStatus(report.status, stats.revisions, stats.corrected, stats.reviewed)
          : rowStatus;

        return {
          id: report?.id ?? -activeUser.id,
          reportId: report?.id ?? null,
          hasReport: !!report,
          userId: activeUser.id,
          userName: activeUser.name,
          userEmail: activeUser.email,
          userRole: activeUser.role,
          departmentId: activeUser.departmentId ?? null,
          departmentName: activeUser.departmentName ?? null,
          date,
          dayName: getDayName(date),
          taskCount: stats.count,
          avgProgress: stats.avg,
          status: displayStatus,
          storedStatus: rowStatus,
          revisionCount: stats.revisions,
          isSubmitted: isSubmittedStatus(rowStatus),
          submittedAt: report?.submittedAt?.toISOString() ?? null,
          createdAt: report?.createdAt?.toISOString() ?? null,
        };
      })
      .filter((row) => {
        if (!status) return true;
        if (status === "belum_submit") return !row.isSubmitted;
        return row.status === status;
      });

    res.json(rows);
    return;
  }

  const conditions: SQL[] = [activeUserCondition()];

  if (dateFrom || dateTo) {
    if (dateFrom) conditions.push(gte(dailyReportsTable.date, dateFrom));
    if (dateTo) conditions.push(lte(dailyReportsTable.date, dateTo));
  } else if (month && year) {
    const m = month.padStart(2, "0");
    conditions.push(gte(dailyReportsTable.date, `${year}-${m}-01`));
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    conditions.push(lte(dailyReportsTable.date, `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`));
  } else if (year) {
    conditions.push(gte(dailyReportsTable.date, `${year}-01-01`));
    conditions.push(lte(dailyReportsTable.date, `${year}-12-31`));
  }
  if (departmentId) conditions.push(eq(dailyReportsTable.departmentId, parseInt(departmentId)));
  if (userId) conditions.push(eq(dailyReportsTable.userId, parseInt(userId)));
  if (status && status !== "belum_submit") conditions.push(eq(dailyReportsTable.status, status));
  if (search) conditions.push(ilike(usersTable.name, `%${search}%`));

  if (status === "belum_submit") {
    res.json([]);
    return;
  }

  const reports = await db
    .select({
      id: dailyReportsTable.id,
      userId: dailyReportsTable.userId,
      departmentId: dailyReportsTable.departmentId,
      date: dailyReportsTable.date,
      status: dailyReportsTable.status,
      submittedAt: dailyReportsTable.submittedAt,
      createdAt: dailyReportsTable.createdAt,
      userName: usersTable.name,
      departmentName: departmentsTable.name,
    })
    .from(dailyReportsTable)
    .leftJoin(usersTable, eq(dailyReportsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(dailyReportsTable.departmentId, departmentsTable.id))
    .where(and(...conditions))
    .orderBy(desc(dailyReportsTable.date), usersTable.name);

  const reportIds = reports.map((report) => report.id);
  let tasksByReport: Record<number, { count: number; avg: number; revisions: number; corrected: number; reviewed: number }> = {};

  if (reportIds.length > 0) {
    const userIds = [...new Set(reports.map((report) => report.userId))];
    const maxReportDate = reports.reduce((latest, report) => report.date > latest ? report.date : latest, reports[0].date);
    const userTaskRows = await db
      .select({
        reportId: dailyTasksTable.reportId,
        userId: dailyReportsTable.userId,
        title: dailyTasksTable.title,
        project: dailyTasksTable.project,
        progress: dailyTasksTable.progress,
        reviewStatus: dailyTasksTable.reviewStatus,
        reportDate: dailyReportsTable.date,
        createdAt: dailyTasksTable.createdAt,
        updatedAt: dailyTasksTable.updatedAt,
      })
      .from(dailyTasksTable)
      .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
      .where(and(
        inArray(dailyReportsTable.userId, userIds),
        lte(dailyReportsTable.date, maxReportDate),
      ));

    tasksByReport = Object.fromEntries(reports.map((report) => {
      const latestTasks = getLatestTasksByProjectTitle(
        userTaskRows.filter((task) => task.userId === report.userId && task.reportDate <= report.date),
      );
      return [report.id, {
        count: latestTasks.length,
        avg: latestTasks.length ? Math.round(latestTasks.reduce((sum, task) => sum + task.progress, 0) / latestTasks.length) : 0,
        revisions: latestTasks.filter((task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")).length,
        corrected: latestTasks.filter((task) => ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? "")).length,
        reviewed: latestTasks.filter((task) => task.reviewStatus === "direview").length,
      }];
    }));
  }

  if (dateFrom && dateTo && dateFrom !== dateTo) {
    const periodTaskRows = reportIds.length
      ? await db
          .select({
            id: dailyTasksTable.id,
            reportId: dailyTasksTable.reportId,
            userId: dailyReportsTable.userId,
            title: dailyTasksTable.title,
            project: dailyTasksTable.project,
            progress: dailyTasksTable.progress,
            reviewStatus: dailyTasksTable.reviewStatus,
            reportDate: dailyReportsTable.date,
            createdAt: dailyTasksTable.createdAt,
            updatedAt: dailyTasksTable.updatedAt,
          })
          .from(dailyTasksTable)
          .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
          .where(inArray(dailyTasksTable.reportId, reportIds))
      : [];
    const latestTasksByUser = new Map<number, typeof periodTaskRows>();
    for (const report of reports) {
      if (latestTasksByUser.has(report.userId)) continue;
      latestTasksByUser.set(
        report.userId,
        getLatestTasksByProjectTitle(periodTaskRows.filter((task) => task.userId === report.userId)),
      );
    }
    const grouped = new Map<number, {
      id: number;
      reportId: number;
      reportIds: number[];
      userId: number;
      userName: string;
      departmentId: number | null;
      departmentName: string | null;
      latestDate: string;
      submittedAt: string | null;
      latestStatus: string;
      createdAt: string;
    }>();

    for (const report of reports) {
      const current = grouped.get(report.userId) ?? {
        id: report.id,
        reportId: report.id,
        reportIds: [],
        userId: report.userId,
        userName: report.userName ?? "",
        departmentId: report.departmentId ?? null,
        departmentName: report.departmentName ?? null,
        latestDate: report.date,
        submittedAt: report.submittedAt?.toISOString() ?? null,
        latestStatus: report.status,
        createdAt: report.createdAt.toISOString(),
      };

      current.reportIds.push(report.id);
      if (report.date >= current.latestDate) {
        current.id = report.id;
        current.reportId = report.id;
        current.latestDate = report.date;
        current.submittedAt = report.submittedAt?.toISOString() ?? null;
        current.latestStatus = report.status;
      }
      grouped.set(report.userId, current);
    }

    res.json(Array.from(grouped.values()).map((item) => {
      const latestTasks = latestTasksByUser.get(item.userId) ?? [];
      const revisions = latestTasks.filter((task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")).length;
      const corrected = latestTasks.filter((task) => ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? "")).length;
      const reviewed = latestTasks.filter((task) => task.reviewStatus === "direview").length;
      return {
        id: item.id,
        reportId: item.reportId,
        reportIds: item.reportIds,
        hasReport: true,
        userId: item.userId,
        userName: item.userName,
        departmentId: item.departmentId,
        departmentName: item.departmentName,
        date: item.latestDate,
        dayName: "Periode",
        periodStartDate: dateFrom,
        periodEndDate: dateTo,
        taskCount: latestTasks.length,
        avgProgress: latestTasks.length ? Math.round(latestTasks.reduce((sum, task) => sum + task.progress, 0) / latestTasks.length) : 0,
        status: getMonitoringReviewStatus(item.latestStatus, revisions, corrected, reviewed),
        storedStatus: item.latestStatus,
        revisionCount: revisions,
        isSubmitted: true,
        submittedAt: item.submittedAt,
        createdAt: item.createdAt,
      };
    }));
    return;
  }

  res.json(reports.map((report) => {
    const stats = tasksByReport[report.id] ?? { count: 0, avg: 0, revisions: 0, corrected: 0, reviewed: 0 };
    return {
      id: report.id,
      reportId: report.id,
      hasReport: true,
      userId: report.userId,
      userName: report.userName ?? "",
      departmentId: report.departmentId ?? null,
      departmentName: report.departmentName ?? null,
      date: report.date,
      dayName: getDayName(report.date),
      taskCount: stats.count,
      avgProgress: stats.avg,
      status: getMonitoringReviewStatus(report.status, stats.revisions, stats.corrected, stats.reviewed),
      storedStatus: report.status,
      revisionCount: stats.revisions,
      isSubmitted: isSubmittedStatus(report.status),
      submittedAt: report.submittedAt?.toISOString() ?? null,
      createdAt: report.createdAt.toISOString(),
    };
  }));
});

router.post("/reports", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk mengedit laporan harian" });
    return;
  }

  const { date, obstacles, additionalNotes, tomorrowPlan, status } = req.body;
  if (!date) { res.status(400).json({ error: "Tanggal diperlukan" }); return; }
  if (isWeekendReportDate(date)) {
    res.status(400).json({ error: "Sabtu/Minggu adalah hari libur, laporan harian tidak wajib diisi" });
    return;
  }

  if (isEmptyText(tomorrowPlan)) {
    res.status(400).json({ error: "Rencana Besok & Target wajib diisi" });
    return;
  }

  // Prevent duplicate: if report exists for this user+date, return existing (upsert pattern)
  const existing = await db.select().from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, user.id), eq(dailyReportsTable.date, date)))
    .limit(1);

  let reportId: number;

  if (existing[0]) {
    // Update existing instead of inserting duplicate
    await db.update(dailyReportsTable)
      .set({
        obstacles: obstacles ?? existing[0].obstacles,
        additionalNotes: additionalNotes ?? existing[0].additionalNotes,
        tomorrowPlan: tomorrowPlan ?? existing[0].tomorrowPlan,
      })
      .where(eq(dailyReportsTable.id, existing[0].id));
    reportId = existing[0].id;
  } else {
    const [report] = await db.insert(dailyReportsTable).values({
      userId: user.id,
      departmentId: user.departmentId ?? null,
      date,
      obstacles: obstacles ?? null,
      additionalNotes: additionalNotes ?? null,
      tomorrowPlan: tomorrowPlan ?? null,
      status: status ?? "draf",
    }).returning();
    reportId = report.id;
  }

  const detail = await buildReportDetail(reportId);
  res.status(201).json(detail);
});

router.get("/reports/today", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const today = getJakartaDateString();
  const reports = await db
    .select()
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, user.id), eq(dailyReportsTable.date, today)))
    .limit(1);

  if (!reports[0]) {
    res.status(404).json({ error: "Tidak ada laporan hari ini" });
    return;
  }

  const detail = await buildReportDetail(reports[0].id);
  res.json(detail);
});

router.get("/reports/period-detail", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const userId = Number(req.query.userId);
  const dateFrom = String(req.query.dateFrom ?? "");
  const dateTo = String(req.query.dateTo ?? "");

  if (!Number.isFinite(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    res.status(400).json({ error: "Parameter periode tidak valid" });
    return;
  }

  const detail = await buildPeriodReportDetail(userId, dateFrom, dateTo);
  if (!detail) { res.status(404).json({ error: "Laporan periode tidak ditemukan" }); return; }
  res.json(detail);
});

router.get("/reports/yesterday-tasks", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const today = getTodayString();
  const requiredPreviousDate = getPreviousRequiredReportDate(today);

  const reports = await db
    .select()
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, user.id), sql`${dailyReportsTable.date} < ${today}`))
    .orderBy(desc(dailyReportsTable.date), desc(dailyReportsTable.createdAt))
    .limit(1);

  if (!reports[0]) {
    res.json({
      tasks: [],
      sourceReportId: null,
      sourceReportDate: null,
      requestedYesterdayDate: requiredPreviousDate,
      missingYesterdayDate: isWeekendReportDate(today) ? null : requiredPreviousDate,
      yesterdayReportMissing: true,
    });
    return;
  }

  const tasks = await db.select().from(dailyTasksTable)
    .where(and(
      eq(dailyTasksTable.reportId, reports[0].id),
      sql`lower(${dailyTasksTable.status}) not in ('selesai', 'delivered')`
    ));

  res.json({
    tasks: tasks.map(t => {
    const editCount = t.editCount ?? 0;

    return {
      id: t.id,
      reportId: t.reportId,
      title: t.title,
      project: t.project ?? null,
      deadline: t.deadline ?? null,
      completionInputType: t.completionInputType ?? null,
      completionValue: t.completionValue ?? null,
      progress: t.progress,
      status: t.status,
      notes: t.notes ?? null,
      editCount,
      remainingActions: getRemainingActions(editCount),
      isLocked: isTaskLockedByCount(editCount),
      isDelay: isTaskDelay(t.deadline, t.status),
      createdAt: t.createdAt.toISOString(),
    };
  }),
    sourceReportId: reports[0].id,
    sourceReportDate: reports[0].date,
    requestedYesterdayDate: requiredPreviousDate,
    missingYesterdayDate: !isWeekendReportDate(today) && reports[0].date !== requiredPreviousDate ? requiredPreviousDate : null,
    yesterdayReportMissing: reports[0].date !== requiredPreviousDate,
  });
});

router.get("/report-comments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const conditions: SQL[] = [];
  if (!isReportCommentManager(user)) {
    conditions.push(eq(dailyReportsTable.userId, user.id));
  }

  const comments = await db
    .select({
      id: reportCommentsTable.id,
      reportId: reportCommentsTable.reportId,
      reportOwnerUserId: dailyReportsTable.userId,
      reportDate: dailyReportsTable.date,
      reportUserName: reportOwnerUsersTable.name,
      departmentName: departmentsTable.name,
      commenterUserId: reportCommentsTable.userId,
      commenterName: reportCommenterUsersTable.name,
      commenterRole: reportCommenterUsersTable.role,
      comment: reportCommentsTable.comment,
      createdAt: reportCommentsTable.createdAt,
    })
    .from(reportCommentsTable)
    .innerJoin(dailyReportsTable, eq(reportCommentsTable.reportId, dailyReportsTable.id))
    .leftJoin(reportOwnerUsersTable, eq(dailyReportsTable.userId, reportOwnerUsersTable.id))
    .leftJoin(departmentsTable, eq(dailyReportsTable.departmentId, departmentsTable.id))
    .leftJoin(reportCommenterUsersTable, eq(reportCommentsTable.userId, reportCommenterUsersTable.id))
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(desc(reportCommentsTable.createdAt));

  res.json(comments.map((comment) => ({
    ...comment,
    commenterName: comment.commenterName ?? "",
    commenterRole: comment.commenterRole ?? "",
    departmentName: comment.departmentName ?? null,
    createdAt: comment.createdAt.toISOString(),
  })));
});

router.post("/reports/:id/comments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const reportId = Number(req.params.id);
  const comment = String(req.body?.comment ?? "").trim();
  if (!Number.isInteger(reportId) || reportId <= 0) { res.status(400).json({ error: "ID laporan tidak valid" }); return; }
  if (!comment) { res.status(400).json({ error: "Komentar wajib diisi" }); return; }

  const [report] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, reportId)).limit(1);
  if (!report) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }

  const [created] = await db.insert(reportCommentsTable).values({
    reportId,
    userId: user.id,
    comment,
  }).returning();

  if (report.userId !== user.id) {
    await db.insert(notificationsTable).values({
      userId: report.userId,
      title: "Komentar Laporan Harian",
      message: `${user.name} menambahkan komentar pada laporan tanggal ${report.date}.`,
      type: "report_comment",
      relatedReportId: report.id,
    });
  }

  res.status(201).json({
    ...created,
    userName: user.name,
    userRole: user.role,
    createdAt: created.createdAt.toISOString(),
  });
});

router.patch("/reports/:id/comments/:commentId", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!isReportCommentManager(user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }

  const reportId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const comment = String(req.body?.comment ?? "").trim();
  if (!Number.isInteger(reportId) || !Number.isInteger(commentId) || !comment) {
    res.status(400).json({ error: "Data komentar tidak valid" });
    return;
  }

  const [updated] = await db.update(reportCommentsTable)
    .set({ comment })
    .where(and(eq(reportCommentsTable.id, commentId), eq(reportCommentsTable.reportId, reportId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Komentar tidak ditemukan" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/reports/:id/comments/:commentId", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!isReportCommentManager(user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }

  const reportId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(reportId) || !Number.isInteger(commentId)) {
    res.status(400).json({ error: "ID komentar tidak valid" });
    return;
  }

  const [deleted] = await db.delete(reportCommentsTable)
    .where(and(eq(reportCommentsTable.id, commentId), eq(reportCommentsTable.reportId, reportId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Komentar tidak ditemukan" }); return; }
  res.json({ success: true });
});

router.get("/reports/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const detail = await buildReportDetail(id);
  if (!detail) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }
  res.json(detail);
});

router.patch("/reports/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const existing = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }
  if (existing[0].userId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk mengedit laporan harian" });
    return;
  }

  const { date, obstacles, additionalNotes, tomorrowPlan, status } = req.body;

  if (tomorrowPlan !== undefined && isEmptyText(tomorrowPlan)) {
    res.status(400).json({ error: "Rencana Besok & Target wajib diisi" });
    return;
  }

  await db.update(dailyReportsTable)
    .set({
      ...(date !== undefined && { date }),
      ...(obstacles !== undefined && { obstacles }),
      ...(additionalNotes !== undefined && { additionalNotes }),
      ...(tomorrowPlan !== undefined && { tomorrowPlan }),
      ...(status !== undefined && { status }),
    })
    .where(eq(dailyReportsTable.id, id));

  const detail = await buildReportDetail(id);
  res.json(detail);
});

router.delete("/reports/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const existing = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }
  if (existing[0].userId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  if (!(await canEditByPermission(user, "daily_report_edit_own"))) {
    res.status(403).json({ error: "Tidak punya izin untuk menghapus laporan harian" });
    return;
  }

  await db.delete(dailyReportsTable).where(eq(dailyReportsTable.id, id));
  res.json({ success: true, message: "Laporan berhasil dihapus" });
});

router.post("/reports/:id/submit", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const existing = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Laporan tidak ditemukan" }); return; }
  if (existing[0].userId !== user.id) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  if (!(await canEditByPermission(user, "daily_report_submit"))) {
    res.status(403).json({ error: "Tidak punya izin untuk submit laporan harian" });
    return;
  }

  if (isEmptyText(existing[0].tomorrowPlan)) {
    res.status(400).json({ error: "Rencana Besok & Target wajib diisi sebelum laporan dikirim" });
    return;
  }

  let tasks = await db
    .select()
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, id));

  let hasTask = tasks.some((task) => task.title.trim().length > 0);

  if (!hasTask && existing[0].date === getTodayString()) {
    await copyUnfinishedPreviousTasksToReport(existing[0].userId, id, existing[0].date);
    tasks = await db
      .select()
      .from(dailyTasksTable)
      .where(eq(dailyTasksTable.reportId, id));
    hasTask = tasks.some((task) => task.title.trim().length > 0);
  }

  if (!hasTask) {
    res.status(400).json({ error: "Daftar Tugas Hari Ini wajib diisi minimal 1 tugas sebelum laporan dikirim" });
    return;
  }

  const revisionTasks = tasks.filter((task) => task.revisionSourceTaskId !== null);
  for (const revisionTask of revisionTasks) {
    await db.update(dailyTasksTable).set({
      reviewStatus: "sudah_diperbaiki",
      correctedAt: new Date(),
    }).where(eq(dailyTasksTable.id, revisionTask.id));
    await db.update(dailyTasksTable).set({
      reviewStatus: "sudah_diperbaiki",
      correctedAt: new Date(),
    }).where(eq(dailyTasksTable.id, revisionTask.revisionSourceTaskId!));
    const [sourceTask] = await db.select({ reportId: dailyTasksTable.reportId })
      .from(dailyTasksTable)
      .where(eq(dailyTasksTable.id, revisionTask.revisionSourceTaskId!))
      .limit(1);
    if (sourceTask) {
      const sourceTasks = await db.select({ reviewStatus: dailyTasksTable.reviewStatus })
        .from(dailyTasksTable)
        .where(eq(dailyTasksTable.reportId, sourceTask.reportId));
      const remaining = sourceTasks.filter((task) =>
        ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? ""),
      ).length;
      await db.update(dailyReportsTable).set({
        status: remaining > 0 ? "perlu_revisi" : "selesai",
      }).where(eq(dailyReportsTable.id, sourceTask.reportId));
    }
  }

  const submittedTasks = await db
    .select({ reviewStatus: dailyTasksTable.reviewStatus })
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, id));
  const remainingRevisions = submittedTasks.filter(
    (task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? ""),
  ).length;
  const completedRevisions = submittedTasks.filter((task) =>
    ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? ""),
  ).length;
  const submittedStatus =
    remainingRevisions > 0
      ? "perlu_revisi"
      : completedRevisions > 0
        ? "selesai"
        : "dikirim";

  await db.update(dailyReportsTable)
    .set({ status: submittedStatus, submittedAt: new Date() })
    .where(eq(dailyReportsTable.id, id));

  const detail = await buildReportDetail(id);
  res.json(detail);
});

router.post("/reports/:id/review", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  if (!(await canEditByPermission(user, "daily_report_review"))) {
    res.status(403).json({ error: "Tidak punya izin untuk review laporan harian" });
    return;
  }

  const { action } = req.body;
  if (!action) { res.status(400).json({ error: "Action diperlukan" }); return; }

  res.status(400).json({
    error: "Review dan revisi laporan wajib dilakukan per tugas pada Detail Laporan",
  });
});

export default router;

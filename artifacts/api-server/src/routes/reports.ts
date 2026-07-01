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
let dailyTasksSchemaReady: Promise<void> | null = null;

const dailyReportBaseSelect = {
  id: dailyReportsTable.id,
  userId: dailyReportsTable.userId,
  departmentId: dailyReportsTable.departmentId,
  date: dailyReportsTable.date,
  obstacles: dailyReportsTable.obstacles,
  additionalNotes: dailyReportsTable.additionalNotes,
  tomorrowPlan: dailyReportsTable.tomorrowPlan,
  status: dailyReportsTable.status,
  createdAt: dailyReportsTable.createdAt,
  updatedAt: dailyReportsTable.updatedAt,
};

const submitTaskSelect = {
  id: dailyTasksTable.id,
  title: dailyTasksTable.title,
  reviewStatus: dailyTasksTable.reviewStatus,
  revisionSourceTaskId: dailyTasksTable.revisionSourceTaskId,
};

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

function ensureDailyTasksSchema() {
  dailyTasksSchemaReady ??= (async () => {
    await db.execute(sql`
      alter table daily_tasks
        add column if not exists deadline text,
        add column if not exists completion_input_type text,
        add column if not exists completion_value text,
        add column if not exists review_status text,
        add column if not exists review_comment text,
        add column if not exists reviewed_by_user_id integer references users(id),
        add column if not exists reviewed_by_name text,
        add column if not exists reviewed_at timestamptz,
        add column if not exists corrected_at timestamptz,
        add column if not exists revision_source_task_id integer,
        add column if not exists revision_work_task_id integer,
        add column if not exists carry_forward_source_task_id integer,
        add column if not exists edit_count integer default 0,
        add column if not exists updated_at timestamptz default now()
    `);

    await db.execute(sql`
      update daily_tasks
      set updated_at = created_at
      where updated_at is null
    `);

    await db.execute(sql`
      update daily_tasks
      set edit_count = 0
      where edit_count is null
    `);

    await db.execute(sql`
      alter table daily_tasks
        alter column edit_count set default 0,
        alter column updated_at set default now()
    `);
  })();

  return dailyTasksSchemaReady.catch((error) => {
    dailyTasksSchemaReady = null;
    throw error;
  });
}

async function tryEnsureDailyReportsSchema() {
  try {
    await ensureDailyReportsSchema();
    return true;
  } catch {
    return false;
  }
}

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

function getSubmittedAtFallback(status: string, timestamp?: Date | null) {
  return isSubmittedStatus(status) ? timestamp?.toISOString() ?? null : null;
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

const TASK_RANGE_START_STATUSES = new Set([
  "belum_mulai",
  "menerima_permintaan",
  "inquiry",
  "input_data_proses",
  "proses",
]);

function getTaskReportDateRanges<T extends {
  title: string;
  project?: string | null;
  reportDate?: string | null;
  status?: string | null;
  progress?: number | null;
}>(tasks: T[]) {
  const ranges = new Map<string, {
    firstReportDate: string | null;
    firstProgress: number | null;
    deliveredReportDate: string | null;
    fallbackFirstReportDate: string | null;
  }>();

  for (const task of tasks) {
    const reportDate = task.reportDate ?? null;
    if (!reportDate) continue;

    const key = getTaskIdentityKey(task);
    const current = ranges.get(key) ?? {
      firstReportDate: null,
      firstProgress: null,
      deliveredReportDate: null,
      fallbackFirstReportDate: null,
    };

    if (!current.fallbackFirstReportDate || reportDate < current.fallbackFirstReportDate) {
      current.fallbackFirstReportDate = reportDate;
    }

    const status = String(task.status ?? "").toLowerCase();
    const progress = Number(task.progress ?? 0);
    if (TASK_RANGE_START_STATUSES.has(status) && (
      current.firstProgress === null ||
      progress < current.firstProgress ||
      (progress === current.firstProgress && (!current.firstReportDate || reportDate < current.firstReportDate))
    )) {
      current.firstReportDate = reportDate;
      current.firstProgress = progress;
    }

    if ((status === "delivered" || status === "selesai") && (!current.deliveredReportDate || reportDate > current.deliveredReportDate)) {
      current.deliveredReportDate = reportDate;
    }

    ranges.set(key, current);
  }

  const normalizedRanges = new Map<string, { firstReportDate: string | null; deliveredReportDate: string | null }>();
  for (const [key, range] of ranges) {
    normalizedRanges.set(key, {
      firstReportDate: range.firstReportDate ?? range.deliveredReportDate ?? range.fallbackFirstReportDate,
      deliveredReportDate: range.deliveredReportDate,
    });
  }

  return normalizedRanges;
}

async function getLatestUnfinishedTasksBeforeReport(userId: number, reportDate: string) {
  await ensureDailyTasksSchema();

  const historicalTasks = await db
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
      editCount: dailyTasksTable.editCount,
      createdAt: dailyTasksTable.createdAt,
      updatedAt: dailyTasksTable.updatedAt,
      reportDate: dailyReportsTable.date,
    })
    .from(dailyTasksTable)
    .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
    .where(and(
      eq(dailyReportsTable.userId, userId),
      sql`${dailyReportsTable.date} < ${reportDate}`,
    ))
    .orderBy(dailyReportsTable.date, dailyTasksTable.createdAt);

  return getLatestTasksByProjectTitle(historicalTasks).filter((task) =>
    task.title.trim().length > 0 &&
    !["selesai", "delivered"].includes(String(task.status).toLowerCase()),
  );
}

async function copyUnfinishedPreviousTasksToReport(userId: number, reportId: number, reportDate: string) {
  await ensureDailyTasksSchema();

  const sourceTasks = await getLatestUnfinishedTasksBeforeReport(userId, reportDate);
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

  const copiedValues = tasksToCopy.map((task) => ({
    reportId,
    title: task.title,
    project: task.project ?? null,
    deadline: task.deadline ?? null,
    completionInputType: task.completionInputType ?? null,
    completionValue: task.completionValue ?? null,
    progress: task.progress,
    status: task.status,
    notes: task.notes ?? null,
  }));
  const copiedValuesWithSource = tasksToCopy.map((task, index) => ({
    ...copiedValues[index]!,
    carryForwardSourceTaskId: task.id,
  }));

  try {
    await db.insert(dailyTasksTable).values(copiedValuesWithSource);
  } catch (error) {
    if (error instanceof Error && /carry_forward_source_task_id/i.test(error.message)) {
      await db.insert(dailyTasksTable).values(copiedValues);
    } else {
      throw error;
    }
  }

  return tasksToCopy.length;
}

async function buildReportDetail(reportId: number, options: { latestOnly?: boolean } = {}) {
  await ensureDailyTasksSchema();

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
      carryForwardSourceTaskId: dailyTasksTable.carryForwardSourceTaskId,
      editCount: dailyTasksTable.editCount,
      createdAt: dailyTasksTable.createdAt,
      updatedAt: dailyTasksTable.updatedAt,
      reportDate: dailyReportsTable.date,
    })
    .from(dailyTasksTable)
    .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
    .where(options.latestOnly
      ? and(
          eq(dailyReportsTable.userId, r.userId),
          lte(dailyReportsTable.date, r.date),
        )
      : eq(dailyTasksTable.reportId, reportId))
    .orderBy(dailyReportsTable.date, dailyTasksTable.createdAt);
  const visibleTasks = options.latestOnly ? getLatestTasksByProjectTitle(tasks) : tasks;
  const taskReportDateRanges = getTaskReportDateRanges(tasks);

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
  const avgProgress = visibleTasks.length > 0
    ? Math.round(visibleTasks.reduce((s, t) => s + t.progress, 0) / visibleTasks.length)
    : 0;
  const revisionCount = visibleTasks.filter((task) => ["revisi", "sedang_diperbaiki"].includes(task.reviewStatus ?? "")).length;
  const correctedCount = visibleTasks.filter((task) => ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus ?? "")).length;
  const reviewedCount = visibleTasks.filter((task) => task.reviewStatus === "direview").length;

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
      revisionCount,
      correctedCount,
      reviewedCount,
    ),
    storedStatus: r.status,
    revisionCount,
    submittedAt: getSubmittedAtFallback(r.status, r.updatedAt),
    tasks: visibleTasks.map(t => {
      const editCount = t.editCount ?? 0;
      const taskRange = taskReportDateRanges.get(getTaskIdentityKey(t));

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
        reportDate: t.reportDate,
        firstReportDate: taskRange?.firstReportDate ?? t.reportDate ?? null,
        deliveredReportDate: taskRange?.deliveredReportDate ?? null,
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
    taskCount: visibleTasks.length,
    avgProgress,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function buildPeriodReportDetail(userId: number, dateFrom: string, dateTo: string) {
  await ensureDailyTasksSchema();

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
  const taskReportDateRanges = getTaskReportDateRanges(tasks);
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
    submittedAt: getSubmittedAtFallback(latestReport.status, latestReport.updatedAt),
    tasks: latestTasks.map((task) => {
      const editCount = task.editCount ?? 0;
      const taskRange = taskReportDateRanges.get(getTaskIdentityKey(task));

      return {
        id: task.id,
        reportId: task.reportId,
        reportDate: task.reportDate,
        firstReportDate: taskRange?.firstReportDate ?? task.reportDate ?? null,
        deliveredReportDate: taskRange?.deliveredReportDate ?? null,
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
  await ensureDailyTasksSchema();

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
        createdAt: dailyReportsTable.createdAt,
        updatedAt: dailyReportsTable.updatedAt,
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

    let tasksByReport: Record<number, { count: number; avg: number; revisions: number; corrected: number; reviewed: number }> = {};

    if (reportsToday.length > 0) {
      const reportIdsToday = reportsToday.map((report) => report.id);
      const userTaskRows = await db
        .select({
          reportId: dailyTasksTable.reportId,
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
        .where(inArray(dailyTasksTable.reportId, reportIdsToday));

      tasksByReport = Object.fromEntries(reportsToday.map((report) => {
        const latestTasks = getLatestTasksByProjectTitle(
          userTaskRows.filter((task) => task.reportId === report.id),
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
          submittedAt: report ? getSubmittedAtFallback(report.status, report.updatedAt) : null,
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
      createdAt: dailyReportsTable.createdAt,
      updatedAt: dailyReportsTable.updatedAt,
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
    const userTaskRows = await db
      .select({
        reportId: dailyTasksTable.reportId,
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
      .where(inArray(dailyTasksTable.reportId, reportIds));

    tasksByReport = Object.fromEntries(reports.map((report) => {
      const latestTasks = getLatestTasksByProjectTitle(
        userTaskRows.filter((task) => task.reportId === report.id),
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
        submittedAt: getSubmittedAtFallback(report.status, report.updatedAt),
        latestStatus: report.status,
        createdAt: report.createdAt.toISOString(),
      };

      current.reportIds.push(report.id);
      if (report.date >= current.latestDate) {
        current.id = report.id;
        current.reportId = report.id;
        current.latestDate = report.date;
        current.submittedAt = getSubmittedAtFallback(report.status, report.updatedAt);
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
      submittedAt: getSubmittedAtFallback(report.status, report.updatedAt),
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
  const existing = await db.select(dailyReportBaseSelect).from(dailyReportsTable)
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
    }).returning({ id: dailyReportsTable.id });
    reportId = report.id;
  }

  if (date === getTodayString()) {
    await copyUnfinishedPreviousTasksToReport(user.id, reportId, date);
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
    .select({ id: dailyReportsTable.id })
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, user.id), eq(dailyReportsTable.date, today)))
    .limit(1);

  if (!reports[0]) {
    res.status(404).json({ error: "Tidak ada laporan hari ini" });
    return;
  }

  await copyUnfinishedPreviousTasksToReport(user.id, reports[0].id, today);

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
  await ensureDailyTasksSchema();

  const today = getTodayString();
  const requiredPreviousDate = getPreviousRequiredReportDate(today);

  const reports = await db
    .select({
      id: dailyReportsTable.id,
      date: dailyReportsTable.date,
      createdAt: dailyReportsTable.createdAt,
    })
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.userId, user.id), sql`${dailyReportsTable.date} < ${today}`))
    .orderBy(desc(dailyReportsTable.date), desc(dailyReportsTable.createdAt))
    .limit(1);

  const tasks = await getLatestUnfinishedTasksBeforeReport(user.id, today);
  const latestTaskSource = tasks.reduce<typeof tasks[number] | null>((latest, task) => {
    if (!latest) return task;
    if ((task.reportDate ?? "") > (latest.reportDate ?? "")) return task;
    if ((task.reportDate ?? "") === (latest.reportDate ?? "") && task.createdAt.getTime() > latest.createdAt.getTime()) return task;
    return latest;
  }, null);

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
      reportDate: t.reportDate,
      createdAt: t.createdAt.toISOString(),
    };
  }),
    sourceReportId: latestTaskSource?.reportId ?? reports[0].id,
    sourceReportDate: latestTaskSource?.reportDate ?? reports[0].date,
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

  const [report] = await db
    .select({
      id: dailyReportsTable.id,
      userId: dailyReportsTable.userId,
      date: dailyReportsTable.date,
    })
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.id, reportId))
    .limit(1);
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
  const existing = await db.select(dailyReportBaseSelect).from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
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
  const existing = await db.select(dailyReportBaseSelect).from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
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
  await ensureDailyTasksSchema();

  const id = parseInt(req.params.id);
  const existing = await db.select(dailyReportBaseSelect).from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
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
    .select(submitTaskSelect)
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, id));

  let hasTask = tasks.some((task) => task.title.trim().length > 0);

  if (!hasTask && existing[0].date === getTodayString()) {
    await copyUnfinishedPreviousTasksToReport(existing[0].userId, id, existing[0].date);
    tasks = await db
      .select(submitTaskSelect)
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

  const canUseSubmittedAt = await tryEnsureDailyReportsSchema();
  await db.update(dailyReportsTable)
    .set(canUseSubmittedAt ? { status: submittedStatus, submittedAt: new Date() } : { status: submittedStatus })
    .where(eq(dailyReportsTable.id, id));

  const detail = await buildReportDetail(id).catch(() => null);
  res.json(detail ?? {
    id,
    userId: existing[0].userId,
    departmentId: existing[0].departmentId ?? null,
    date: existing[0].date,
    status: submittedStatus,
    storedStatus: submittedStatus,
    submittedAt: getSubmittedAtFallback(submittedStatus, new Date()),
    tasks: [],
    comments: [],
  });
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

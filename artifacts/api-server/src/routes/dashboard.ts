import {
  db,
  assignedDailyTasksTable,
  dailyReportsTable,
  dailyTasksTable,
  usersTable,
  departmentsTable,
  and,
  eq,
  inArray,
  sql,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router } from "express";
import {
  getJakartaDateString,
  isWeekendReportDate,
  reportingUserCondition,
} from "../services/dailyReportReminder";

const router = Router();

function normalizeDashboardDate(value: unknown): string {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getJakartaDateString();
}

function addDateDays(dateString: string, amount: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getWeekStartDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function getActiveWeekDates(dateString: string): string[] {
  const weekStartDate = getWeekStartDate(dateString);
  const dates: string[] = [];
  let current = weekStartDate;

  while (current <= dateString) {
    if (!isWeekendReportDate(current)) dates.push(current);
    current = addDateDays(current, 1);
  }

  return dates;
}

router.get("/dashboard/summary", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = normalizeDashboardDate(req.query.date);
  const weekStartDate = getWeekStartDate(date);
  const activeWeekDates = getActiveWeekDates(date);
  const expectedReportCount = activeWeekDates.length;

  const reportingUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(reportingUserCondition());

  const reportingUserIds = reportingUsers.map((item) => item.id);
  const totalEmployees = reportingUserIds.length;

  if (expectedReportCount === 0) {
    res.json({
      totalEmployees,
      submittedToday: 0,
      notSubmittedToday: 0,
      totalTasksToday: 0,
      tasksCompleted: 0,
      tasksPending: 0,
      submitRate: 0,
      completionRate: 0,
      pendingAssignedTasksCount: 0,
      pendingAssignedTasksByAssigner: [],
      weekStartDate,
      weekEndDate: date,
    });
    return;
  }

  const submittedReports = totalEmployees > 0
    ? await db
      .select({ id: dailyReportsTable.id, userId: dailyReportsTable.userId, date: dailyReportsTable.date })
      .from(dailyReportsTable)
      .where(and(
        inArray(dailyReportsTable.date, activeWeekDates),
        sql`lower(${dailyReportsTable.status}) not in ('draf', 'belum_submit')`,
        inArray(dailyReportsTable.userId, reportingUserIds),
      ))
    : [];

  const submittedToday = new Set(
    submittedReports.map((report) => `${report.userId}:${report.date}`),
  ).size;
  const expectedSubmissions = totalEmployees * expectedReportCount;
  const notSubmittedToday = Math.max(0, expectedSubmissions - submittedToday);

  let totalTasksToday = 0;
  let tasksCompleted = 0;
  let tasksPending = 0;

  if (submittedReports.length > 0) {
    const reportIds = submittedReports.map((report) => report.id);
    const taskStats = await db
      .select({
        status: dailyTasksTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(dailyTasksTable)
      .where(inArray(dailyTasksTable.reportId, reportIds))
      .groupBy(dailyTasksTable.status);

    for (const stat of taskStats) {
      totalTasksToday += stat.count;
      if (stat.status === "selesai") tasksCompleted += stat.count;
      if (stat.status === "pending") tasksPending += stat.count;
    }
  }

  const submitRate = expectedSubmissions > 0 ? Math.round((submittedToday / expectedSubmissions) * 100) : 0;
  const completionRate = totalTasksToday > 0 ? Math.round((tasksCompleted / totalTasksToday) * 100) : 0;
  const pendingAssignedTaskStats = await db
    .select({
      assignedByName: assignedDailyTasksTable.assignedByName,
      count: sql<number>`count(*)::int`,
    })
    .from(assignedDailyTasksTable)
    .where(and(
      eq(assignedDailyTasksTable.assigneeUserId, user.id),
      eq(assignedDailyTasksTable.status, "pending"),
    ))
    .groupBy(assignedDailyTasksTable.assignedByName);

  const pendingAssignedTasksCount = pendingAssignedTaskStats.reduce(
    (total, item) => total + item.count,
    0,
  );

  res.json({
    totalEmployees,
    submittedToday,
    notSubmittedToday,
    totalTasksToday,
    tasksCompleted,
    tasksPending,
    submitRate,
    completionRate,
    pendingAssignedTasksCount,
    pendingAssignedTasksByAssigner: pendingAssignedTaskStats.map((item) => ({
      assignedByName: item.assignedByName,
      count: item.count,
    })),
    weekStartDate,
    weekEndDate: date,
  });
});

router.get("/dashboard/department-productivity", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = normalizeDashboardDate(req.query.date);
  const weekStartDate = getWeekStartDate(date);
  const activeWeekDates = getActiveWeekDates(date);
  const expectedReportCount = activeWeekDates.length;

  if (expectedReportCount === 0) {
    res.json([]);
    return;
  }

  const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.name);

  const result = await Promise.all(departments.map(async (dept) => {
    const [employeeCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.departmentId, dept.id), reportingUserCondition()));

    const employeeCount = employeeCountResult?.count ?? 0;

    if (employeeCount === 0) {
      return null;
    }

    const submittedReports = await db
      .select({ id: dailyReportsTable.id })
      .from(dailyReportsTable)
      .leftJoin(usersTable, eq(dailyReportsTable.userId, usersTable.id))
      .where(and(
        eq(dailyReportsTable.departmentId, dept.id),
        inArray(dailyReportsTable.date, activeWeekDates),
        sql`lower(${dailyReportsTable.status}) not in ('draf', 'belum_submit')`,
        reportingUserCondition(),
      ));

    const submittedCount = submittedReports.length;
    const expectedSubmissions = employeeCount * expectedReportCount;

    let avgProgress = 0;
    if (submittedReports.length > 0) {
      const ids = submittedReports.map((report) => report.id);
      const [progressResult] = await db
        .select({ avg: sql<number>`coalesce(avg(${dailyTasksTable.progress}), 0)::int` })
        .from(dailyTasksTable)
        .where(inArray(dailyTasksTable.reportId, ids));
      avgProgress = progressResult?.avg ?? 0;
    }

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      employeeCount,
      submittedCount,
      avgProgress,
      expectedSubmissions,
      submitRate: expectedSubmissions > 0 ? Math.round((submittedCount / expectedSubmissions) * 100) : 0,
      weekStartDate,
      weekEndDate: date,
    };
  }));

  res.json(result.filter(Boolean));
});

export default router;

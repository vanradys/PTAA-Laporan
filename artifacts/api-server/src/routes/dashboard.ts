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
  submittedReportCondition,
} from "../services/dailyReportReminder";

const router = Router();

function normalizeDashboardDate(value: unknown): string {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getJakartaDateString();
}

router.get("/dashboard/summary", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = normalizeDashboardDate(req.query.date);

  const reportingUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(reportingUserCondition());

  const reportingUserIds = reportingUsers.map((item) => item.id);
  const totalEmployees = reportingUserIds.length;

  if (isWeekendReportDate(date)) {
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
    });
    return;
  }

  const submittedReports = totalEmployees > 0
    ? await db
      .select({ id: dailyReportsTable.id, userId: dailyReportsTable.userId })
      .from(dailyReportsTable)
      .where(and(
        submittedReportCondition(date),
        inArray(dailyReportsTable.userId, reportingUserIds),
      ))
    : [];

  const submittedToday = new Set(submittedReports.map((report) => report.userId)).size;
  const notSubmittedToday = Math.max(0, totalEmployees - submittedToday);

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

  const submitRate = totalEmployees > 0 ? Math.round((submittedToday / totalEmployees) * 100) : 0;
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
  });
});

router.get("/dashboard/department-productivity", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = normalizeDashboardDate(req.query.date);

  if (isWeekendReportDate(date)) {
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
        submittedReportCondition(date),
        reportingUserCondition(),
      ));

    const submittedCount = submittedReports.length;

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
      submitRate: employeeCount > 0 ? Math.round((submittedCount / employeeCount) * 100) : 0,
    };
  }));

  res.json(result.filter(Boolean));
});

export default router;

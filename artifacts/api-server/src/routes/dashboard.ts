import {
  db,
  dailyReportsTable,
  dailyTasksTable,
  usersTable,
  departmentsTable,
  and,
  eq,
  inArray,
  notInArray,
  REMOVED_USER_EMAILS,
  sql,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router, type Router as ExpressRouter } from "express";
import { getJakartaDateString } from "../services/dailyReportReminder";

const router: ExpressRouter = Router();

function activeUserCondition() {
  return and(sql`${usersTable.isActive} is distinct from false`, notInArray(usersTable.email, [...REMOVED_USER_EMAILS]));
}

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

  const activeUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(activeUserCondition());

  const activeUserIds = activeUsers.map((item) => item.id);
  const totalEmployees = activeUserIds.length;

  const submittedReports = totalEmployees > 0
    ? await db
      .select({ id: dailyReportsTable.id, userId: dailyReportsTable.userId })
      .from(dailyReportsTable)
      .where(and(
        eq(dailyReportsTable.date, date),
        sql`${dailyReportsTable.status} <> 'draf'`,
        inArray(dailyReportsTable.userId, activeUserIds),
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

  res.json({
    totalEmployees,
    submittedToday,
    notSubmittedToday,
    totalTasksToday,
    tasksCompleted,
    tasksPending,
    submitRate,
    completionRate,
  });
});

router.get("/dashboard/department-productivity", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = normalizeDashboardDate(req.query.date);
  const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.name);

  const result = await Promise.all(departments.map(async (dept) => {
    const [employeeCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.departmentId, dept.id), activeUserCondition()));

    const employeeCount = employeeCountResult?.count ?? 0;

    const submittedReports = await db
      .select({ id: dailyReportsTable.id })
      .from(dailyReportsTable)
      .leftJoin(usersTable, eq(dailyReportsTable.userId, usersTable.id))
      .where(and(
        eq(dailyReportsTable.departmentId, dept.id),
        eq(dailyReportsTable.date, date),
        sql`${dailyReportsTable.status} <> 'draf'`,
        activeUserCondition(),
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

  res.json(result);
});

export default router;

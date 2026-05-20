import {
  and,
  db,
  dailyReportsTable,
  dailyTasksTable,
  departmentsTable,
  eq,
  inArray,
  sql,
  usersTable,
  type SQL,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router, type Router as ExpressRouter } from "express";

const router: ExpressRouter = Router();

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
  return sql`${usersTable.isActive} is distinct from false`;
}

router.get("/dashboard/summary", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = (req.query.date as string) || getJakartaDateString();

  const activeUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(activeUserCondition());

  const activeUserIds = activeUsers.map((item) => item.id);
  const totalEmployees = activeUserIds.length;

  const submittedReports = activeUserIds.length > 0
    ? await db
      .select({ id: dailyReportsTable.id, userId: dailyReportsTable.userId })
      .from(dailyReportsTable)
      .where(
        and(
          eq(dailyReportsTable.date, date),
          sql`${dailyReportsTable.status} != 'draf'`,
          inArray(dailyReportsTable.userId, activeUserIds),
        ),
      )
    : [];

  const submittedUserIds = new Set(submittedReports.map((report) => report.userId));
  const submittedToday = submittedUserIds.size;
  const notSubmittedToday = Math.max(0, totalEmployees - submittedToday);

  let totalTasksToday = 0;
  let tasksCompleted = 0;
  let tasksPending = 0;

  if (submittedReports.length > 0) {
    const ids = submittedReports.map((report) => report.id);
    const taskStats = await db
      .select({
        status: dailyTasksTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(dailyTasksTable)
      .where(inArray(dailyTasksTable.reportId, ids))
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

  const date = (req.query.date as string) || getJakartaDateString();

  const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.name);

  const result = await Promise.all(departments.map(async (dept) => {
    const departmentUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(activeUserCondition(), eq(usersTable.departmentId, dept.id)));

    const employeeCount = departmentUsers.length;
    const userIds = departmentUsers.map((item) => item.id);

    const submittedReports = userIds.length > 0
      ? await db
        .select({ id: dailyReportsTable.id, userId: dailyReportsTable.userId })
        .from(dailyReportsTable)
        .where(
          and(
            eq(dailyReportsTable.departmentId, dept.id),
            eq(dailyReportsTable.date, date),
            sql`${dailyReportsTable.status} != 'draf'`,
            inArray(dailyReportsTable.userId, userIds),
          ),
        )
      : [];

    const submittedCount = new Set(submittedReports.map((report) => report.userId)).size;

    let avgProgress = 0;
    if (submittedReports.length > 0) {
      const ids = submittedReports.map((report) => report.id);
      const [progResult] = await db
        .select({ avg: sql<number>`coalesce(avg(${dailyTasksTable.progress}), 0)::int` })
        .from(dailyTasksTable)
        .where(inArray(dailyTasksTable.reportId, ids));
      avgProgress = progResult?.avg ?? 0;
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

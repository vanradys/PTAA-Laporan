import { Router } from "express";
import {
  db, dailyReportsTable, dailyTasksTable,
  usersTable, departmentsTable
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const [totalResult] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const totalEmployees = totalResult?.count ?? 0;

  const submittedReports = await db.select({ userId: dailyReportsTable.userId })
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.date, date), sql`${dailyReportsTable.status} != 'draf'`));
  const submittedToday = submittedReports.length;
  const notSubmittedToday = Math.max(0, totalEmployees - submittedToday);

  const reportIds = submittedReports.length > 0
    ? await db.select({ id: dailyReportsTable.id }).from(dailyReportsTable).where(eq(dailyReportsTable.date, date))
    : [];

  let totalTasksToday = 0, tasksCompleted = 0, tasksPending = 0;

  if (reportIds.length > 0) {
    const ids = reportIds.map(r => r.id);
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

  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const departments = await db.select().from(departmentsTable);

  const result = await Promise.all(departments.map(async (dept) => {
    const [empCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.departmentId, dept.id));

    const submittedReports = await db
      .select({ id: dailyReportsTable.id })
      .from(dailyReportsTable)
      .where(and(
        eq(dailyReportsTable.departmentId, dept.id),
        eq(dailyReportsTable.date, date),
        sql`${dailyReportsTable.status} != 'draf'`
      ));

    const submittedCount = submittedReports.length;
    const employeeCount = empCount?.count ?? 0;

    let avgProgress = 0;
    if (submittedReports.length > 0) {
      const ids = submittedReports.map(r => r.id);
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

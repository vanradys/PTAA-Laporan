import {
  and,
  assignedDailyTasksTable,
  companyHolidaysTable,
  dailyReportsTable,
  dailyTasksTable,
  db,
  departmentsTable,
  eq,
  gte,
  inArray,
  lte,
  sql,
  usersTable,
} from "@workspace/db";
import { Router } from "express";
import { getUserFromToken } from "./auth";
import { getJakartaDateString, reportingUserCondition } from "../services/dailyReportReminder";

const router = Router();
const COMPANY_DASHBOARD_ROLES = new Set(["admin", "direktur", "director", "dir"]);
const COMPLETED_TASK_STATUSES = new Set(["delivered", "selesai"]);
const PENDING_TASK_STATUSES = new Set(["belum_mulai", "input_data_proses", "proses", "pending"]);

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getJakartaDateString();
}

function normalizePeriod(value: unknown): "weekly" | "monthly" {
  return value === "monthly" ? "monthly" : "weekly";
}

function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getPeriodBounds(dateString: string, period: "weekly" | "monthly") {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (period === "monthly") {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
      start: `${year}-${String(month + 1).padStart(2, "0")}-01`,
      end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
    };
  }
  const day = date.getUTCDay();
  const monday = addDays(dateString, -(day === 0 ? 6 : day - 1));
  return { start: monday, end: addDays(monday, 4) };
}

async function getWorkingDates(start: string, end: string) {
  const holidays = await db.select({ date: companyHolidaysTable.date })
    .from(companyHolidaysTable)
    .where(and(gte(companyHolidaysTable.date, start), lte(companyHolidaysTable.date, end)));
  const holidaySet = new Set(holidays.map((item) => item.date));
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    const day = new Date(`${current}T00:00:00.000Z`).getUTCDay();
    if (day !== 0 && day !== 6 && !holidaySet.has(current)) dates.push(current);
  }
  return dates;
}

router.get("/dashboard/summary", async (req, res) => {
  const token = req.cookies?.session_token;
  const user = token ? await getUserFromToken(token) : null;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const date = normalizeDate(req.query.date);
  const period = normalizePeriod(req.query.period);
  const { start, end } = getPeriodBounds(date, period);
  const workingDates = await getWorkingDates(start, end);
  const companyScope = COMPANY_DASHBOARD_ROLES.has(String(user.role).toLowerCase());

  const reportingUsers = await db.select({ id: usersTable.id }).from(usersTable)
    .where(reportingUserCondition());
  const allReportingIds = reportingUsers.map((item) => item.id);
  const scopedUserIds = companyScope ? allReportingIds : [user.id];
  const employeeCount = companyScope ? allReportingIds.length : 1;
  const expectedSubmissions = workingDates.length * employeeCount;

  const submittedReports = scopedUserIds.length && workingDates.length
    ? await db.select({
        id: dailyReportsTable.id,
        userId: dailyReportsTable.userId,
        date: dailyReportsTable.date,
      }).from(dailyReportsTable).where(and(
        inArray(dailyReportsTable.userId, scopedUserIds),
        inArray(dailyReportsTable.date, workingDates),
        sql`lower(${dailyReportsTable.status}) not in ('draf', 'belum_submit')`,
      ))
    : [];
  const submittedCount = new Set(submittedReports.map((item) => `${item.userId}:${item.date}`)).size;

  const taskStats = scopedUserIds.length
    ? await db.select({
        status: dailyTasksTable.status,
        count: sql<number>`count(*)::int`,
      }).from(dailyTasksTable)
        .innerJoin(dailyReportsTable, eq(dailyTasksTable.reportId, dailyReportsTable.id))
        .where(and(
          inArray(dailyReportsTable.userId, scopedUserIds),
          sql`(${dailyTasksTable.updatedAt} at time zone 'Asia/Jakarta')::date >= ${start}::date`,
          sql`(${dailyTasksTable.updatedAt} at time zone 'Asia/Jakarta')::date <= ${end}::date`,
        ))
        .groupBy(dailyTasksTable.status)
    : [];

  let totalTasks = 0;
  let completedTasks = 0;
  let pendingTasks = 0;
  for (const item of taskStats) {
    totalTasks += item.count;
    if (COMPLETED_TASK_STATUSES.has(item.status)) completedTasks += item.count;
    if (PENDING_TASK_STATUSES.has(item.status)) pendingTasks += item.count;
  }

  const pendingAssignedTaskStats = await db.select({
    assignedByName: assignedDailyTasksTable.assignedByName,
    count: sql<number>`count(*)::int`,
  }).from(assignedDailyTasksTable).where(and(
    eq(assignedDailyTasksTable.assigneeUserId, user.id),
    eq(assignedDailyTasksTable.status, "pending"),
  )).groupBy(assignedDailyTasksTable.assignedByName);

  res.json({
    totalEmployees: employeeCount,
    expectedWorkDays: workingDates.length,
    expectedSubmissions,
    submittedToday: submittedCount,
    notSubmittedToday: Math.max(0, expectedSubmissions - submittedCount),
    totalTasksToday: totalTasks,
    tasksCompleted: completedTasks,
    tasksPending: pendingTasks,
    submitRate: expectedSubmissions ? Math.round(submittedCount / expectedSubmissions * 100) : 0,
    completionRate: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0,
    pendingAssignedTasksCount: pendingAssignedTaskStats.reduce((sum, item) => sum + item.count, 0),
    pendingAssignedTasksByAssigner: pendingAssignedTaskStats,
    scope: companyScope ? "company" : "personal",
    period,
    periodStartDate: start,
    periodEndDate: end,
    weekStartDate: start,
    weekEndDate: end,
  });
});

router.get("/dashboard/department-productivity", async (req, res) => {
  const token = req.cookies?.session_token;
  const user = token ? await getUserFromToken(token) : null;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  const date = normalizeDate(req.query.date);
  const period = normalizePeriod(req.query.period);
  const { start, end } = getPeriodBounds(date, period);
  const workingDates = await getWorkingDates(start, end);
  const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.name);

  const result = [];
  for (const department of departments) {
    const employees = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.departmentId, department.id), reportingUserCondition()));
    if (!employees.length) continue;
    const employeeIds = employees.map((item) => item.id);
    const reports = workingDates.length
      ? await db.select({
          userId: dailyReportsTable.userId,
          date: dailyReportsTable.date,
        }).from(dailyReportsTable).where(and(
          inArray(dailyReportsTable.userId, employeeIds),
          inArray(dailyReportsTable.date, workingDates),
          sql`lower(${dailyReportsTable.status}) not in ('draf', 'belum_submit')`,
        ))
      : [];
    const submittedCount = new Set(reports.map((item) => `${item.userId}:${item.date}`)).size;
    const expectedSubmissions = employees.length * workingDates.length;
    result.push({
      departmentId: department.id,
      departmentName: department.name,
      employeeCount: employees.length,
      submittedCount,
      expectedSubmissions,
      submitRate: expectedSubmissions ? Math.round(submittedCount / expectedSubmissions * 100) : 0,
      period,
      periodStartDate: start,
      periodEndDate: end,
    });
  }
  res.json(result);
});

export default router;

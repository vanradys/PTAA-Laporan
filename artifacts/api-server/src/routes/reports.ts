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
import {
  getPreviousRequiredReportDate,
  isSubmittedReportStatus,
  isWeekendReportDate,
  reportingUserCondition,
} from "../services/dailyReportReminder";

const router = Router();

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

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
  if (status === "selesai") return false;
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

  const tasks = await db.select().from(dailyTasksTable)
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
      tasks.filter((task) => task.reviewStatus === "revisi").length,
      tasks.filter((task) => task.reviewStatus === "sudah_diperbaiki").length,
      tasks.filter((task) => task.reviewStatus === "direview").length,
    ),
    storedStatus: r.status,
    revisionCount: tasks.filter((task) => task.reviewStatus === "revisi").length,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    tasks: tasks.map(t => {
      const editCount = t.editCount ?? 0;

      return {
        id: t.id,
        reportId: t.reportId,
        title: t.title,
        project: t.project ?? null,
        deadline: t.deadline ?? null,
        progress: t.progress,
        status: t.status,
        notes: t.notes ?? null,
        reviewStatus: t.reviewStatus ?? null,
        reviewComment: t.reviewComment ?? null,
        reviewedByUserId: t.reviewedByUserId ?? null,
        reviewedByName: t.reviewedByName ?? null,
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        correctedAt: t.correctedAt?.toISOString() ?? null,
        editCount,
        remainingActions: getRemainingActions(editCount),
        isLocked: isTaskLockedByCount(editCount),
        isDelay: isTaskDelay(t.deadline, t.status),
        createdAt: t.createdAt.toISOString(),
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

router.get("/reports", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const { date, month, year, departmentId, userId, status, search } = req.query as Record<string, string>;

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
          revisions: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} = 'revisi')::int`,
          corrected: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} = 'sudah_diperbaiki')::int`,
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

  if (month && year) {
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
    const taskStats = await db
      .select({
        reportId: dailyTasksTable.reportId,
        count: sql<number>`count(*)::int`,
        avg: sql<number>`coalesce(avg(${dailyTasksTable.progress}), 0)::int`,
        revisions: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} = 'revisi')::int`,
        corrected: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} = 'sudah_diperbaiki')::int`,
        reviewed: sql<number>`count(*) filter (where ${dailyTasksTable.reviewStatus} = 'direview')::int`,
      })
      .from(dailyTasksTable)
      .where(inArray(dailyTasksTable.reportId, reportIds))
      .groupBy(dailyTasksTable.reportId);

    tasksByReport = Object.fromEntries(taskStats.map((item) => [item.reportId, item]));
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
      or(
        eq(dailyTasksTable.status, "pending"),
        eq(dailyTasksTable.status, "proses"),
        eq(dailyTasksTable.status, "belum_mulai"),
      )
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

  if (isEmptyText(existing[0].tomorrowPlan)) {
    res.status(400).json({ error: "Rencana Besok & Target wajib diisi sebelum laporan dikirim" });
    return;
  }

  const tasks = await db
    .select()
    .from(dailyTasksTable)
    .where(eq(dailyTasksTable.reportId, id));

  const hasTask = tasks.some((task) => task.title.trim().length > 0);

  if (!hasTask) {
    res.status(400).json({ error: "Daftar Tugas Hari Ini wajib diisi minimal 1 tugas sebelum laporan dikirim" });
    return;
  }

  await db.update(dailyReportsTable)
    .set({ status: "dikirim", submittedAt: new Date() })
    .where(eq(dailyReportsTable.id, id));

  const detail = await buildReportDetail(id);
  res.json(detail);
});

router.post("/reports/:id/review", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const allowedRoles = ["admin", "hr", "direktur"];
  if (!allowedRoles.includes(user.role)) { res.status(403).json({ error: "Hanya HR/Admin/Direktur yang dapat mereview" }); return; }

  const id = parseInt(req.params.id);
  const { action, comment } = req.body;
  if (!action) { res.status(400).json({ error: "Action diperlukan" }); return; }

  const statusMap: Record<string, string> = {
    review: "direview",
    revision: "perlu_revisi",
  };
  const newStatus = statusMap[action];
  if (!newStatus) { res.status(400).json({ error: "Action tidak valid" }); return; }

  await db.update(dailyReportsTable)
    .set({ status: newStatus })
    .where(eq(dailyReportsTable.id, id));

  if (comment) {
    await db.insert(reportCommentsTable).values({
      reportId: id,
      userId: user.id,
      comment,
    });
  }

  const report = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id)).limit(1);
  if (report[0]) {
    const notifTitle = action === "review" ? "Laporan Direview" : "Laporan Perlu Revisi";
    const notifMsg = action === "review"
      ? `Laporan Anda pada tanggal ${report[0].date} telah direview oleh ${user.name}`
      : `Laporan Anda pada tanggal ${report[0].date} memerlukan revisi`;

    await db.insert(notificationsTable).values({
      userId: report[0].userId,
      title: notifTitle,
      message: notifMsg,
      type: action === "review" ? "review" : "revision",
      relatedReportId: id,
    });
  }

  const detail = await buildReportDetail(id);
  res.json(detail);
});

export default router;

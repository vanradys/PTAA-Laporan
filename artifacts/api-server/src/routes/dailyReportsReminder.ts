import { Router, type Request, type Response } from "express";
import { getUserFromToken } from "./auth";
import {
  canManageDailyReportReminder,
  getMissingDailyReportUsers,
  getReminderScope,
  normalizeReportDate,
  sendDailyReportReminders,
} from "../services/dailyReportReminder";

const router = Router();

async function getAuthenticatedUser(req: Request) {
  const token = req.cookies?.session_token;
  if (!token) return null;
  return getUserFromToken(token);
}

function sendRouteError(res: Response, error: unknown, fallback: string) {
  console.error(fallback, error);

  res.status(500).json({
    error: fallback,
    detail: error instanceof Error ? error.message : String(error),
  });
}

router.get("/daily-reports/missing/today", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

    if (!canManageDailyReportReminder(user)) {
      res.status(403).json({ error: "Anda tidak memiliki akses monitoring reminder" });
      return;
    }

    const reportDate = normalizeReportDate(req.query.date);
    const missingUsers = await getMissingDailyReportUsers(getReminderScope(user), reportDate);
    res.json(missingUsers);
  } catch (error) {
    sendRouteError(res, error, "Gagal mengambil data reminder laporan harian");
  }
});

router.post("/daily-reports/remind-missing", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

    if (!canManageDailyReportReminder(user)) {
      res.status(403).json({ error: "Anda tidak memiliki akses mengirim reminder" });
      return;
    }

    const reportDate = normalizeReportDate(req.body?.date);
    const result = await sendDailyReportReminders({
      sentBy: user.id,
      scope: getReminderScope(user),
      reportDate,
    });

    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Gagal mengirim reminder laporan harian");
  }
});

router.post("/daily-reports/remind-missing/auto", async (req, res) => {
  try {
    const secret = String(req.headers["x-system-secret"] ?? "");

    if (!process.env.SYSTEM_CRON_SECRET || secret !== process.env.SYSTEM_CRON_SECRET) {
      res.status(403).json({ error: "Endpoint ini hanya boleh dipakai sistem" });
      return;
    }

    const reportDate = normalizeReportDate(req.body?.date);
    const result = await sendDailyReportReminders({ sentBy: null, reportDate });
    res.json(result);
  } catch (error) {
    sendRouteError(res, error, "Gagal mengirim reminder otomatis laporan harian");
  }
});

export default router;

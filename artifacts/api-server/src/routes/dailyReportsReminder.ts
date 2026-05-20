import { Router, type Request, type Router as ExpressRouter } from "express";
import { getUserFromToken } from "./auth";
import {
  canManageDailyReportReminder,
  getMissingDailyReportUsers,
  getReminderScope,
  sendDailyReportReminders,
} from "../services/dailyReportReminder";

const router: ExpressRouter = Router();

async function getAuthenticatedUser(req: Request) {
  const token = req.cookies?.session_token;
  if (!token) return null;
  return getUserFromToken(token);
}

router.get("/daily-reports/missing/today", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  if (!canManageDailyReportReminder(user)) {
    res.status(403).json({ error: "Anda tidak memiliki akses monitoring reminder" });
    return;
  }

  const missingUsers = await getMissingDailyReportUsers(getReminderScope(user));
  res.json(missingUsers);
});

router.post("/daily-reports/remind-missing", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }

  if (!canManageDailyReportReminder(user)) {
    res.status(403).json({ error: "Anda tidak memiliki akses mengirim reminder" });
    return;
  }

  const result = await sendDailyReportReminders({
    sentBy: user.id,
    scope: getReminderScope(user),
  });

  res.json(result);
});

router.post("/daily-reports/remind-missing/auto", async (req, res) => {
  const secret = String(req.headers["x-system-secret"] ?? "");

  if (!process.env.SYSTEM_CRON_SECRET || secret !== process.env.SYSTEM_CRON_SECRET) {
    res.status(403).json({ error: "Endpoint ini hanya boleh dipakai sistem" });
    return;
  }

  const result = await sendDailyReportReminders({ sentBy: null });
  res.json(result);
});

export default router;

import * as cron from "node-cron";
import { logger } from "../lib/logger";
import { sendDailyReportReminders } from "../services/dailyReportReminder";

export function startDailyReportReminderScheduler() {
  if (process.env.DISABLE_DAILY_REPORT_REMINDER_CRON === "true") {
    logger.info("Daily report reminder scheduler disabled");
    return;
  }

  cron.schedule(
    "0 16 * * 1-5",
    async () => {
      try {
        const result = await sendDailyReportReminders({ sentBy: null });
        logger.info(result, "Daily report reminder scheduler finished");
      } catch (error) {
        logger.error({ error }, "Daily report reminder scheduler failed");
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  logger.info("Daily report reminder scheduler started at 16:00 WIB Monday-Friday");
}

import app from "./app";
import { logger } from "./lib/logger";
import { startDailyReportReminderScheduler } from "./schedulers/dailyReportReminderScheduler";

const rawPort = process.env["PORT"] ?? "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  startDailyReportReminderScheduler();
});

server.on("error", (err: unknown) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
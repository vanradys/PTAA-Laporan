import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import departmentsRouter from "./departments";
import reportsRouter from "./reports";
import tasksRouter from "./tasks";
import commentsRouter from "./comments";
import notificationsRouter from "./notifications";
import dashboardRouter from "./dashboard";
import poRouter from "./po";
import customerTrackingRouter from "./customerTracking";
import dailyReportsReminderRouter from "./dailyReportsReminder";

const router = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(departmentsRouter);
router.use(reportsRouter);
router.use(tasksRouter);
router.use(commentsRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);
router.use(poRouter);
router.use(customerTrackingRouter);
router.use(dailyReportsReminderRouter);

export default router;

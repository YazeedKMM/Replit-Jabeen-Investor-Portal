import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import updatesRouter from "./updates";
import documentsRouter from "./documents";
import messagesRouter from "./messages";
import notesRouter from "./notes";
import notificationsRouter from "./notifications";
import dashboardRouter from "./dashboard";
import templatesRouter from "./templates";
import usersRouter from "./users";
import auditRouter from "./audit";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(updatesRouter);
router.use(documentsRouter);
router.use(messagesRouter);
router.use(notesRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);
router.use(templatesRouter);
router.use(usersRouter);
router.use(auditRouter);
router.use(settingsRouter);

export default router;

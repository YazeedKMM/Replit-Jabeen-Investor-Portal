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
import citiesRouter from "./cities";
import categoriesRouter from "./categories";
import { requireAuth, requireActiveAccount } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

const protectedRouter: IRouter = Router();
protectedRouter.use(requireAuth);
protectedRouter.use(requireActiveAccount);
protectedRouter.use(projectsRouter);
protectedRouter.use(updatesRouter);
protectedRouter.use(documentsRouter);
protectedRouter.use(messagesRouter);
protectedRouter.use(notesRouter);
protectedRouter.use(notificationsRouter);
protectedRouter.use(dashboardRouter);
protectedRouter.use(templatesRouter);
protectedRouter.use(usersRouter);
protectedRouter.use(auditRouter);
protectedRouter.use(settingsRouter);
protectedRouter.use(citiesRouter);
protectedRouter.use(categoriesRouter);

router.use(protectedRouter);

export default router;

import { Router, type IRouter } from "express";
import analyzeShelfRouter from "./analyze-shelf";
import adminRouter from "./admin";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeShelfRouter);
router.use("/admin", adminRouter);

export default router;

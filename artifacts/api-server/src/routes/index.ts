import { Router, type IRouter } from "express";
import analyzeShelfRouter from "./analyze-shelf";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeShelfRouter);

export default router;

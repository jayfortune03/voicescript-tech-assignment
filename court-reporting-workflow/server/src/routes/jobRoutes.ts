import { Router } from "express";
import {
  createJob,
  assignReporter,
  assignEditor,
  updateStatus,
  processPayment,
  getJobs,
} from "../controllers/jobController.js";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router = Router();

// Routes
router.get("/", authenticate, getJobs);

router.post("/", createJob);

router.post(
  "/:jobId/assign-reporter",
  authenticate,
  authorize(["ADMIN"]),
  assignReporter,
);

router.post(
  "/:jobId/assign-editor",
  authenticate,
  authorize(["ADMIN"]),
  assignEditor,
);

router.patch(
  "/:jobId/status",
  authenticate,
  authorize(["ADMIN", "EDITOR"]),
  updateStatus,
);

router.post("/:jobId/pay", authenticate, authorize(["ADMIN"]), processPayment);

export default router;

import { Router } from "express";
import {
  createJob,
  assignReporter,
  assignEditor,
  updateStatus,
  processPayment,
} from "../controllers/jobController.js";

const router = Router();

// Routes
router.post("/", createJob);

router.post("/:jobId/assign-reporter", assignReporter);

router.post("/:jobId/assign-editor", assignEditor);

router.patch("/:jobId/status", updateStatus);

router.post("/:jobId/pay", processPayment);

export default router;

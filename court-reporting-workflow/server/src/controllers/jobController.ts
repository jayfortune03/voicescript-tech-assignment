import type { Request, Response } from "express";
import * as jobService from "../services/jobService.js";

export const createJob = async (req: Request, res: Response) => {
  try {
    const { caseName, duration, locationType, city } = req.body;
    const job = await jobService.createNewJob(
      caseName,
      duration,
      locationType,
      city,
    );
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to create job" });
  }
};

export const assignReporter = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };

    const { reporterId, version } = req.body;
    const updatedJob = await jobService.assignReporterToJob(
      jobId,
      reporterId,
      version,
    );
    res.status(200).json(updatedJob);
  } catch (error: any) {
    if (error.message === "CONCURRENCY_CONFLICT")
      return res.status(409).json({ error: "Conflict" });
    res.status(500).json({ error: "Failed to assign" });
  }
};

export const assignEditor = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };

    const { editorId, version } = req.body;
    const updatedJob = await jobService.assignEditorToJob(
      jobId,
      editorId,
      version,
    );
    res.status(200).json(updatedJob);
  } catch (error: any) {
    if (error.message === "CONCURRENCY_CONFLICT")
      return res.status(409).json({ error: "Conflict" });
    res.status(500).json({ error: "Failed to assign" });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };

    const { status } = req.body;
    const updatedJob = await jobService.updateJobStatus(jobId, status);
    res.status(200).json(updatedJob);
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
};

export const processPayment = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };

    const result = await jobService.calculateAndSavePayment(jobId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Payment processing failed" });
  }
};

import type { Request, Response, NextFunction } from "express";
import * as jobService from "../services/jobService.js";
import { ApiError } from "../utils/ApiError.js";
import { createJobSchema, jobIdSchema } from "../utils/validate.js";
import { ZodError } from "zod";

export const getJobs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status } = req.query;

    const jobs = await jobService.getAllJobs(status as string);
    res.status(200).json(jobs);
  } catch (error) {
    next(error);
  }
};

export const createJob = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { caseName, duration, locationType, city } = createJobSchema.parse(
      req.body,
    );
    const job = await jobService.createNewJob(
      caseName,
      duration,
      locationType,
      city,
    );
    res.status(201).json(job);
  } catch (error) {
    if (error instanceof ZodError) {
      console.log(
        `🚀  =>  jobController.ts:7  =>  createJob  =>  error:`,
        error,
      );

      // error sekarang dikenali sebagai ZodError oleh TS
      // Kita ambil pesan error pertama agar lebih bersih
      // const errorMessage = error._zod[0]?.message || "Validation failed";
      // return next(new ApiError(400, "Validation failed: " + errorMessage));
    }

    if (error instanceof Error && error.message === "CONCURRENCY_CONFLICT") {
      return next(
        new ApiError(409, "Conflict: Job telah diklaim oleh orang lain."),
      );
    }
    next(error);
  }
};

export const assignReporter = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jobId } = jobIdSchema.parse(req.params);
    const { reporterId, version } = req.body;

    // Validasi input sederhana
    if (!reporterId || typeof version !== "number") {
      throw new ApiError(
        400,
        "Invalid payload: reporterId and version are required.",
      );
    }

    const updatedJob = await jobService.assignReporterToJob(
      jobId,
      reporterId,
      version,
    );
    res.status(200).json(updatedJob);
  } catch (error: any) {
    if (error.message === "CONCURRENCY_CONFLICT") {
      return next(
        new ApiError(409, "Conflict: This job has already been claimed."),
      );
    }
    next(error);
  }
};

export const assignEditor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jobId } = jobIdSchema.parse(req.params);
    const { editorId, version } = req.body;

    if (!editorId || typeof version !== "number") {
      throw new ApiError(
        400,
        "Invalid payload: editorId and version are required.",
      );
    }

    const updatedJob = await jobService.assignEditorToJob(
      jobId,
      editorId,
      version,
    );
    res.status(200).json(updatedJob);
  } catch (error: any) {
    if (error.message === "CONCURRENCY_CONFLICT") {
      return next(
        new ApiError(
          409,
          "Conflict: Job state has changed, cannot assign editor.",
        ),
      );
    }
    next(error);
  }
};

export const updateStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jobId } = jobIdSchema.parse(req.params);
    const { status } = req.body;

    if (!status) throw new ApiError(400, "Status is required.");

    const updatedJob = await jobService.updateJobStatus(jobId, status);
    res.status(200).json(updatedJob);
  } catch (error) {
    next(error);
  }
};

export const processPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jobId } = jobIdSchema.parse(req.params);
    const result = await jobService.calculateAndSavePayment(jobId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

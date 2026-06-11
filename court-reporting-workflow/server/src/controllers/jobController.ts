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
    if (locationType === "PHYSICAL" && !city?.trim()) {
      throw new ApiError(400, "City is required for physical jobs.");
    }

    const job = await jobService.createNewJob(
      caseName,
      duration,
      locationType,
      city?.trim() || null,
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
    if (error.message === "NOT_FOUND") {
      return next(new ApiError(404, "Job or reporter was not found."));
    }
    if (error.message === "JOB_ALREADY_TAKEN") {
      return next(new ApiError(409, "This job already has a reporter."));
    }
    if (error.message === "REPORTER_UNAVAILABLE") {
      return next(new ApiError(400, "Reporter is not available."));
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
    if (error.message === "EDITOR_UNAVAILABLE") {
      return next(new ApiError(400, "Editor is not available."));
    }
    if (error.message === "CONCURRENCY_CONFLICT_OR_INVALID_STATUS") {
      return next(
        new ApiError(
          409,
          "Editor can only be assigned after the job is transcribed.",
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
    const { status, version } = req.body;

    if (!status) throw new ApiError(400, "Status is required.");
    if (typeof version !== "number") {
      throw new ApiError(400, "Version is required.");
    }

    const updatedJob = await jobService.updateJobStatus(
      jobId,
      status,
      version,
      req.user!,
    );
    res.status(200).json(updatedJob);
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return next(new ApiError(404, "Job was not found."));
    }
    if (error.message === "INVALID_TRANSITION") {
      return next(new ApiError(400, "Invalid status transition."));
    }
    if (error.message === "FORBIDDEN_STATUS_UPDATE") {
      return next(
        new ApiError(403, "You cannot update this job for your current role."),
      );
    }
    if (error.message === "CONCURRENCY_CONFLICT_OR_INVALID_STATUS") {
      return next(
        new ApiError(
          409,
          "Job was changed by someone else. Refresh and try again.",
        ),
      );
    }
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
  } catch (error: any) {
    if (error.message === "JOB_NOT_REVIEWED") {
      return next(
        new ApiError(400, "Payment can only be processed after review."),
      );
    }
    next(error);
  }
};

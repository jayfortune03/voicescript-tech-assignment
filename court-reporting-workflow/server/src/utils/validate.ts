import { z } from "zod";

export const createJobSchema = z.object({
  caseName: z.string().min(3),
  duration: z.number().positive(),
  locationType: z.enum(["PHYSICAL", "REMOTE"]),
  city: z.string().nullable(),
});

export const assignReporterSchema = z.object({
  reporterId: z.string("Reporter ID is required"),
  version: z.number().int().positive(),
});

export const jobIdSchema = z.object({
  jobId: z.string("Job ID is required"),
});

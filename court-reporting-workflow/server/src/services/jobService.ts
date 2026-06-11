import { db } from "../db/index.js";
import { emitJobUpdated } from "../realtime/events.js";

type Transaction = {
  oneOrNone<T = any>(query: string, values?: unknown[]): Promise<T | null>;
  one<T = any>(query: string, values?: unknown[]): Promise<T>;
  none(query: string, values?: unknown[]): Promise<unknown>;
};

export const getAllJobs = async (filterStatus?: string) => {
  let query = `SELECT * FROM "Job"`;
  const params = [];

  if (filterStatus) {
    query += ` WHERE status = $1`;
    params.push(filterStatus);
  }

  query += ` ORDER BY "createdAt" DESC`;

  return await db.any(query, params);
};

export const createNewJob = async (
  caseName: string,
  duration: number,
  locationType: string,
  city: string | null,
) => {
  return await db.one(
    `INSERT INTO "Job" ("id", "caseName", duration, "locationType", city, status, version, "createdAt", "updatedAt") 
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'NEW', 1, NOW(), NOW()) 
     RETURNING *`,
    [caseName, duration, locationType, city],
  );
};

export const assignReporterToJob = async (
  jobId: string,
  reporterId: string,
  currentVersion: number,
) => {
  return db.tx(async (t) => {
    const updatedJob = await assignReporterInTransaction(
      t,
      jobId,
      reporterId,
      currentVersion,
    );
    emitJobUpdated({ action: "REPORTER_ASSIGNED", job: updatedJob });
    return updatedJob;
  });
};

export const claimAvailableUser = async (
  t: Transaction,
  userId: string,
  role: "REPORTER" | "EDITOR",
) => {
  return t.oneOrNone(
    `UPDATE "User"
     SET "isAvailable" = false
     WHERE id = $1 AND role = $2 AND "isAvailable" = true
     RETURNING *`,
    [userId, role],
  );
};

export const assignReporterInTransaction = async (
  t: Transaction,
  jobId: string,
  reporterId: string,
  currentVersion: number,
) => {
  const job = await t.oneOrNone(`SELECT * FROM "Job" WHERE id = $1`, [jobId]);

  if (!job) throw new Error("NOT_FOUND");
  if (job.status !== "NEW") throw new Error("JOB_ALREADY_TAKEN");

  const reporter = await claimAvailableUser(t, reporterId, "REPORTER");
  if (!reporter) {
    throw new Error("REPORTER_UNAVAILABLE");
  }

  const updatedJob = await t.oneOrNone(
    `UPDATE "Job" 
     SET "reporterId" = $1, status = 'ASSIGNED', "updatedAt" = NOW(), version = version + 1
     WHERE id = $2 AND status = 'NEW' AND version = $3
     RETURNING *`,
    [reporterId, jobId, currentVersion],
  );

  if (!updatedJob) throw new Error("CONCURRENCY_CONFLICT");

  return updatedJob;
};

export const assignEditorToJob = async (
  jobId: string,
  editorId: string,
  currentVersion: number,
) => {
  return db.tx(async (t) => {
    const updatedJob = await assignEditorInTransaction(
      t,
      jobId,
      editorId,
      currentVersion,
    );
    emitJobUpdated({ action: "EDITOR_ASSIGNED", job: updatedJob });
    return updatedJob;
  });
};

export const assignEditorInTransaction = async (
  t: Transaction,
  jobId: string,
  editorId: string,
  currentVersion: number,
) => {
  const editor = await claimAvailableUser(t, editorId, "EDITOR");
  if (!editor) throw new Error("EDITOR_UNAVAILABLE");

  const updatedJob = await t.oneOrNone(
    `UPDATE "Job" 
     SET "editorId" = $1, status = 'IN_REVIEW', "updatedAt" = NOW(), version = version + 1
     WHERE id = $2 AND status = 'TRANSCRIBED' AND version = $3
     RETURNING *`,
    [editorId, jobId, currentVersion],
  );

  if (!updatedJob) throw new Error("CONCURRENCY_CONFLICT_OR_INVALID_STATUS");

  return updatedJob;
};

const allowedTransitions: Record<string, string[]> = {
  ASSIGNED: ["TRANSCRIBED"],
  IN_REVIEW: ["REVIEWED"],
};

export const updateJobStatus = async (
  jobId: string,
  status: string,
  currentVersion: number,
  actor: { userId: string; role: string },
) => {
  const job = await db.oneOrNone(`SELECT * FROM "Job" WHERE id = $1`, [jobId]);

  if (!job) throw new Error("NOT_FOUND");
  if (!allowedTransitions[job.status]?.includes(status)) {
    throw new Error("INVALID_TRANSITION");
  }

  const isAdmin = actor.role === "ADMIN";
  const isAssignedReporter =
    actor.role === "REPORTER" &&
    job.reporterId === actor.userId &&
    job.status === "ASSIGNED" &&
    status === "TRANSCRIBED";
  const isAssignedEditor =
    actor.role === "EDITOR" &&
    job.editorId === actor.userId &&
    job.status === "IN_REVIEW" &&
    status === "REVIEWED";

  if (!isAdmin && !isAssignedReporter && !isAssignedEditor) {
    throw new Error("FORBIDDEN_STATUS_UPDATE");
  }

  const updatedJob = await db.oneOrNone(
    `UPDATE "Job"
     SET status = $1, "updatedAt" = NOW(), version = version + 1
     WHERE id = $2 AND status = $3 AND version = $4
     RETURNING *`,
    [status, jobId, job.status, currentVersion],
  );

  if (!updatedJob) {
    throw new Error("CONCURRENCY_CONFLICT_OR_INVALID_STATUS");
  }

  if (status === "TRANSCRIBED" && job.reporterId) {
    await db.none(`UPDATE "User" SET "isAvailable" = true WHERE id = $1`, [
      job.reporterId,
    ]);
  }

  if (status === "REVIEWED" && job.editorId) {
    await db.none(`UPDATE "User" SET "isAvailable" = true WHERE id = $1`, [
      job.editorId,
    ]);
  }

  emitJobUpdated({ action: "STATUS_UPDATED", job: updatedJob });
  return updatedJob;
};

export const calculateAndSavePayment = async (jobId: string) => {
  return db.tx(async (t) => {
    const completedJob = await completeReviewedJobAndSavePayments(t, jobId);
    emitJobUpdated({
      action: "JOB_COMPLETED_AND_PAID",
      job: completedJob,
    });
    return { job: completedJob };
  });
};

export const completeReviewedJobAndSavePayments = async (
  t: Transaction,
  jobId: string,
) => {
  const completedJob = await t.oneOrNone(
    `UPDATE "Job"
     SET status = 'COMPLETED', "updatedAt" = NOW(), version = version + 1
     WHERE id = $1 AND status = 'REVIEWED'
     RETURNING *`,
    [jobId],
  );

  if (!completedJob) {
    throw new Error("JOB_NOT_REVIEWED");
  }

  const RATE_PER_MIN = 2000;
  const EDITOR_FLAT_FEE = 50000;
  const reporterAmount = completedJob.duration * RATE_PER_MIN;

  if (completedJob.reporterId) {
    await t.none(
      `INSERT INTO "Payment" ("id", "jobId", "userId", "amount", "role", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 'REPORTER', NOW())`,
      [completedJob.id, completedJob.reporterId, reporterAmount],
    );
    await t.none(`UPDATE "User" SET "isAvailable" = true WHERE id = $1`, [
      completedJob.reporterId,
    ]);
  }

  if (completedJob.editorId) {
    await t.none(
      `INSERT INTO "Payment" ("id", "jobId", "userId", "amount", "role", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 'EDITOR', NOW())`,
      [completedJob.id, completedJob.editorId, EDITOR_FLAT_FEE],
    );
    await t.none(`UPDATE "User" SET "isAvailable" = true WHERE id = $1`, [
      completedJob.editorId,
    ]);
  }

  return completedJob;
};

export const markJobAsTranscribed = async (
  jobId: string,
  currentVersion: number,
) => {
  const updatedJob = await db.oneOrNone(
    `UPDATE "Job" 
     SET status = 'TRANSCRIBED', "updatedAt" = NOW(), version = version + 1
     WHERE id = $1 AND status = 'ASSIGNED' AND version = $2
     RETURNING *`,
    [jobId, currentVersion],
  );

  if (!updatedJob) {
    throw new Error("CONCURRENCY_CONFLICT_OR_INVALID_STATUS");
  }

  emitJobUpdated({ action: "JOB_TRANSCRIBED", job: updatedJob });
  return updatedJob;
};

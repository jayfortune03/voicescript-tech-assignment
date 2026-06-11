import { db } from "../db/index.js";
import { io } from "../index.js";

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
    const job = await t.oneOrNone(`SELECT * FROM "Job" WHERE id = $1`, [jobId]);
    const reporter = await t.oneOrNone(`SELECT * FROM "User" WHERE id = $1`, [
      reporterId,
    ]);

    if (!job || !reporter) throw new Error("NOT_FOUND");
    if (job.status !== "NEW") throw new Error("JOB_ALREADY_TAKEN");

    if (!reporter.isAvailable) {
      throw new Error("REPORTER_UNAVAILABLE");
    }

    if (job.locationType === "PHYSICAL" && job.city !== reporter.city) {
      throw new Error("CITY_MISMATCH");
    }

    const updatedJob = await t.oneOrNone(
      `UPDATE "Job" 
       SET "reporterId" = $1, status = 'ASSIGNED', "updatedAt" = NOW(), version = version + 1
       WHERE id = $2 AND status = 'NEW' AND version = $3
       RETURNING *`,
      [reporterId, jobId, currentVersion],
    );

    if (!updatedJob) throw new Error("CONCURRENCY_CONFLICT");

    await t.none(`UPDATE "User" SET "isAvailable" = false WHERE id = $1`, [
      reporterId,
    ]);

    io.emit("jobUpdated", { action: "REPORTER_ASSIGNED", job: updatedJob });
    return updatedJob;
  });
};

export const assignEditorToJob = async (
  jobId: string,
  editorId: string,
  currentVersion: number,
) => {
  return db.tx(async (t) => {
    const editor = await t.oneOrNone(`SELECT * FROM "User" WHERE id = $1`, [
      editorId,
    ]);
    if (!editor || !editor.isAvailable) throw new Error("EDITOR_UNAVAILABLE");

    const updatedJob = await t.oneOrNone(
      `UPDATE "Job" 
       SET "editorId" = $1, status = 'IN_REVIEW', "updatedAt" = NOW(), version = version + 1
       WHERE id = $2 AND status = 'TRANSCRIBED' AND version = $3
       RETURNING *`,
      [editorId, jobId, currentVersion],
    );

    if (!updatedJob) throw new Error("CONCURRENCY_CONFLICT_OR_INVALID_STATUS");

    await t.none(`UPDATE "User" SET "isAvailable" = false WHERE id = $1`, [
      editorId,
    ]);

    io.emit("jobUpdated", { action: "EDITOR_ASSIGNED", job: updatedJob });
    return updatedJob;
  });
};

export const updateJobStatus = async (jobId: string, status: string) => {
  const updatedJob = await db.one(
    `UPDATE "Job" SET status = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *`,
    [status, jobId],
  );
  io.emit("jobUpdated", { action: "STATUS_UPDATED", job: updatedJob });
  return updatedJob;
};

export const calculateAndSavePayment = async (jobId: string) => {
  return db.tx(async (t) => {
    const job = await t.one(`SELECT * FROM "Job" WHERE id = $1`, [jobId]);

    if (job.status !== "REVIEWED") {
      throw new Error("JOB_NOT_REVIEWED");
    }

    const RATE_PER_MIN = 2000;
    const EDITOR_FLAT_FEE = 50000;
    const reporterAmount = job.duration * RATE_PER_MIN;

    if (job.reporterId) {
      await t.none(
        `INSERT INTO "Payment" ("id", "jobId", "userId", "amount", "role", "createdAt") 
         VALUES (gen_random_uuid(), $1, $2, $3, 'REPORTER', NOW())`,
        [job.id, job.reporterId, reporterAmount],
      );
      await t.none(`UPDATE "User" SET "isAvailable" = true WHERE id = $1`, [
        job.reporterId,
      ]);
    }

    if (job.editorId) {
      await t.none(
        `INSERT INTO "Payment" ("id", "jobId", "userId", "amount", "role", "createdAt") 
         VALUES (gen_random_uuid(), $1, $2, $3, 'EDITOR', NOW())`,
        [job.id, job.editorId, EDITOR_FLAT_FEE],
      );
      await t.none(`UPDATE "User" SET "isAvailable" = true WHERE id = $1`, [
        job.editorId,
      ]);
    }

    const completedJob = await t.one(
      `UPDATE "Job" SET status = 'COMPLETED', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
      [jobId],
    );

    io.emit("jobUpdated", {
      action: "JOB_COMPLETED_AND_PAID",
      job: completedJob,
    });
    return { job: completedJob };
  });
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

  io.emit("jobUpdated", { action: "JOB_TRANSCRIBED", job: updatedJob });
  return updatedJob;
};

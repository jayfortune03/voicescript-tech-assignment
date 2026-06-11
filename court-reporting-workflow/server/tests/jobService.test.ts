import assert from "node:assert/strict";
import test from "node:test";
import {
  assignEditorInTransaction,
  assignReporterInTransaction,
  claimAvailableUser,
} from "../src/services/jobService.js";

type Call = {
  method: string;
  query: string;
  values?: unknown[];
};

class FakeTransaction {
  calls: Call[] = [];

  constructor(private oneOrNoneResults: unknown[] = []) {}

  async oneOrNone<T = any>(query: string, values?: unknown[]) {
    this.calls.push({ method: "oneOrNone", query, values });
    return (this.oneOrNoneResults.shift() ?? null) as T | null;
  }

  async one<T = any>(query: string, values?: unknown[]) {
    this.calls.push({ method: "one", query, values });
    return {} as T;
  }

  async none(query: string, values?: unknown[]) {
    this.calls.push({ method: "none", query, values });
  }
}

test("claimAvailableUser atomically claims only available users for the requested role", async () => {
  const tx = new FakeTransaction([{ id: "rep-1", role: "REPORTER" }]);

  const user = await claimAvailableUser(tx, "rep-1", "REPORTER");

  assert.deepEqual(user, { id: "rep-1", role: "REPORTER" });
  assert.equal(tx.calls.length, 1);
  assert.match(tx.calls[0].query, /UPDATE "User"/);
  assert.match(tx.calls[0].query, /"isAvailable" = true/);
  assert.match(tx.calls[0].query, /role = \$2/);
  assert.deepEqual(tx.calls[0].values, ["rep-1", "REPORTER"]);
});

test("assignReporterInTransaction fails before job update when reporter is already claimed", async () => {
  const tx = new FakeTransaction([
    { id: "job-1", status: "NEW" },
    null,
  ]);

  await assert.rejects(
    () => assignReporterInTransaction(tx, "job-1", "rep-1", 1),
    /REPORTER_UNAVAILABLE/,
  );

  assert.equal(tx.calls.length, 2);
  assert.match(tx.calls[0].query, /SELECT \* FROM "Job"/);
  assert.match(tx.calls[1].query, /UPDATE "User"/);
});

test("assignReporterInTransaction uses job version guard after claiming reporter", async () => {
  const updatedJob = {
    id: "job-1",
    status: "ASSIGNED",
    reporterId: "rep-1",
    version: 2,
  };
  const tx = new FakeTransaction([
    { id: "job-1", status: "NEW" },
    { id: "rep-1", role: "REPORTER" },
    updatedJob,
  ]);

  const result = await assignReporterInTransaction(tx, "job-1", "rep-1", 1);

  assert.deepEqual(result, updatedJob);
  assert.equal(tx.calls.length, 3);
  assert.match(tx.calls[2].query, /WHERE id = \$2 AND status = 'NEW' AND version = \$3/);
  assert.deepEqual(tx.calls[2].values, ["rep-1", "job-1", 1]);
});

test("assignEditorInTransaction fails before job update when editor is already claimed", async () => {
  const tx = new FakeTransaction([null]);

  await assert.rejects(
    () => assignEditorInTransaction(tx, "job-1", "edit-1", 4),
    /EDITOR_UNAVAILABLE/,
  );

  assert.equal(tx.calls.length, 1);
  assert.match(tx.calls[0].query, /UPDATE "User"/);
  assert.deepEqual(tx.calls[0].values, ["edit-1", "EDITOR"]);
});

test("assignEditorInTransaction uses transcribed status and version guard", async () => {
  const updatedJob = {
    id: "job-1",
    status: "IN_REVIEW",
    editorId: "edit-1",
    version: 5,
  };
  const tx = new FakeTransaction([
    { id: "edit-1", role: "EDITOR" },
    updatedJob,
  ]);

  const result = await assignEditorInTransaction(tx, "job-1", "edit-1", 4);

  assert.deepEqual(result, updatedJob);
  assert.equal(tx.calls.length, 2);
  assert.match(
    tx.calls[1].query,
    /WHERE id = \$2 AND status = 'TRANSCRIBED' AND version = \$3/,
  );
  assert.deepEqual(tx.calls[1].values, ["edit-1", "job-1", 4]);
});

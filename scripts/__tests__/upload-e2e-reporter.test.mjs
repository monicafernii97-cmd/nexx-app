import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import UploadE2EReporter from "../../e2e/support/upload-reporter.ts";

test("publishes only validated synthetic run ids from cleanup evidence", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "upload-reporter-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputFile = path.join(directory, "summary.json");
  const reporter = new UploadE2EReporter({ outputFile });
  const runId = "e2e-pr-20260904150555-abcdefgh";
  const testCase = {
    titlePath: () => ["signed-in upload returns a usable answer"],
    parent: { project: () => ({ name: "upload-pr" }) },
  };

  reporter.onTestEnd(testCase, {
    status: "failed",
    retry: 0,
    duration: 10,
    error: { message: "ordinary assertion failure" },
    attachments: [
      {
        name: "cleanup-result",
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ status: "passed", runId })),
      },
      {
        name: "upload-metrics",
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ token: "must-not-be-copied" })),
      },
    ],
  });
  reporter.onEnd({ status: "failed" });

  const summary = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  assert.deepEqual(summary.results[0].attachments, [
    { name: "cleanup-result", contentType: "application/json", runId },
    { name: "upload-metrics", contentType: "application/json" },
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /must-not-be-copied/);
});

test("rejects unvalidated cleanup run ids", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "upload-reporter-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputFile = path.join(directory, "summary.json");
  const reporter = new UploadE2EReporter({ outputFile });

  reporter.onTestEnd(
    {
      titlePath: () => ["cleanup"],
      parent: { project: () => ({ name: "upload-pr" }) },
    },
    {
      status: "failed",
      retry: 0,
      duration: 10,
      attachments: [
        {
          name: "cleanup-failure",
          contentType: "application/json",
          body: Buffer.from(
            JSON.stringify({ runId: "../../unsafe", secret: "do-not-copy" }),
          ),
        },
      ],
    },
  );
  reporter.onEnd({ status: "failed" });

  const summary = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  assert.deepEqual(summary.results[0].attachments, [
    { name: "cleanup-failure", contentType: "application/json" },
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /unsafe|do-not-copy/);
});

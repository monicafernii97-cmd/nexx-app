import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workflowDir = path.resolve(".github/workflows");
const browserWorkflows = [
  "chat-upload-e2e-preview.yml",
  "chat-upload-e2e-release.yml",
  "chat-upload-e2e-resilience.yml",
  "chat-upload-e2e-scheduled.yml",
];

test("scheduled browser assurance uses the America/Chicago time zone", () => {
  const scheduled = fs.readFileSync(
    path.join(workflowDir, "chat-upload-e2e-scheduled.yml"),
    "utf8",
  );
  const resilience = fs.readFileSync(
    path.join(workflowDir, "chat-upload-e2e-resilience.yml"),
    "utf8",
  );

  assert.equal(
    scheduled.match(/timezone:\s*["']America\/Chicago["']/g)?.length,
    2,
  );
  assert.match(resilience, /timezone:\s*["']America\/Chicago["']/);
});

test("every browser workflow uploads an owner-facing operations envelope", () => {
  for (const filename of browserWorkflows) {
    const source = fs.readFileSync(path.join(workflowDir, filename), "utf8");
    assert.match(
      source,
      /node scripts\/build-upload-e2e-operations-envelope\.mjs/,
      filename,
    );
    assert.match(source, /playwright-report\/upload-e2e-operations\.json/, filename);
    assert.ok(
      source.indexOf("Build owner-facing operations envelope") <
        source.indexOf("Upload sanitized browser evidence"),
      `${filename} must build the envelope before artifact upload`,
    );
  }
});

test("resilience deployment pins the validated Vercel CLI", () => {
  const source = fs.readFileSync(
    path.join(workflowDir, "chat-upload-e2e-resilience.yml"),
    "utf8",
  );
  assert.match(source, /npx vercel@59\.11\.0 deploy/);
  assert.doesNotMatch(source, /vercel@(?:latest|53\.4\.0)/);
});

test("release assurance cannot loop on GitHub environment deployments", () => {
  const source = fs.readFileSync(
    path.join(workflowDir, "chat-upload-e2e-release.yml"),
    "utf8",
  );
  assert.match(
    source,
    /github\.event\.deployment\.creator\.login == 'vercel\[bot\]'/,
  );
  assert.match(
    source,
    /github\.event\.deployment\.ref == github\.event\.repository\.default_branch/,
  );
});

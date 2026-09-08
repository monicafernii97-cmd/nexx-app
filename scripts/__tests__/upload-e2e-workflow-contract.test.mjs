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

test("scheduled assurance deduplicates late daily and weekly lane attempts", () => {
  const scheduled = fs.readFileSync(
    path.join(workflowDir, "chat-upload-e2e-scheduled.yml"),
    "utf8",
  );

  assert.match(scheduled, /recovery:\s*[\s\S]*type:\s*boolean/);
  assert.match(scheduled, /actions:\s*read/);
  assert.match(scheduled, /node scripts\/check-upload-e2e-coverage\.mjs/);
  assert.match(scheduled, /inputs\.recovery == true/);
  assert.match(
    scheduled,
    /group: chat-upload-scheduled-\$\{\{ inputs\.lane \|\| \(github\.event\.schedule == '0 4 \* \* 0' && 'weekly' \|\| 'daily'\) \}\}/,
  );
  assert.match(
    scheduled,
    /needs\.coverage\.outputs\.lane == 'daily' && needs\.coverage\.outputs\.should-run == 'true'/,
  );
  assert.match(
    scheduled,
    /needs\.coverage\.outputs\.lane == 'weekly' && needs\.coverage\.outputs\.should-run == 'true'/,
  );
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
  assert.doesNotMatch(
    source,
    /github\.event\.deployment\.ref == github\.event\.repository\.default_branch/,
  );
});

test("release assurance atomically registers a passing pair before checking hard stops", () => {
  const source = fs.readFileSync(
    path.join(workflowDir, "chat-upload-e2e-release.yml"),
    "utf8",
  );
  assert.match(source, /publish-executive-chat-release\.mjs pair/);
  assert.match(source, /report:executive-chat-health/);
  assert.ok(
    source.indexOf("test:e2e:executive-chat:release") < source.indexOf("publish-executive-chat-release.mjs pair"),
  );
  assert.ok(
    source.indexOf("publish-executive-chat-release.mjs pair") < source.indexOf("report:executive-chat-health"),
  );
});

test("Node and release dependencies are pinned to the production runtime", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  const action = fs.readFileSync(path.resolve(".github/actions/setup-node/action.yml"), "utf8");
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal(packageJson.packageManager, "npm@11.11.0");
  assert.equal(packageJson.dependencies.convex, "1.45.0");
  assert.match(action, /default: '24\.14\.1'/);
});

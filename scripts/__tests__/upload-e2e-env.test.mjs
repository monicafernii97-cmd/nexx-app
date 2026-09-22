import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function verify(url, preview = true) {
  return spawnSync(process.execPath, ["scripts/verify-upload-e2e-env.mjs"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      E2E_BASE_URL: url,
      E2E_REQUIRE_VERCEL_PREVIEW: String(preview),
      E2E_LANE: "pr",
      E2E_OWNER_EMAIL: "upload-robot-owner+preview@nexproof.io",
      CLERK_SECRET_KEY: "test-placeholder",
      CLERK_PUBLISHABLE_KEY: "test-placeholder",
    },
  });
}

test("rejects the incident's GitHub job target before browser authentication", () => {
  const result = verify("https://github.com/example/app/actions/runs/123/job/456", false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must point to the application, not GitHub/);
});

test("accepts a Vercel preview origin", () => {
  assert.equal(verify("https://nexx-app-example.vercel.app").status, 0);
});

test("rejects non-preview and misleading preview targets without exposing their URLs", () => {
  for (const url of [
    "https://nexproof.io", "https://vercel.com/example/deployments/123",
    "https://app.vercel.app.evil.example", "http://app.vercel.app",
    "https://app.vercel.app/path", "https://app.vercel.app?token=private-value",
    "https://user:private-value@app.vercel.app", "https://app.vercel.app:444",
  ]) {
    const result = verify(url);
    assert.notEqual(result.status, 0, url);
    assert.match(result.stderr, /requires a Vercel HTTPS application origin/);
    assert.doesNotMatch(result.stderr, /private-value/);
  }
});

test("preserves local development testing", () => {
  assert.equal(verify("http://localhost:3000", false).status, 0);
});

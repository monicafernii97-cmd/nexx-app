import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type UploadFixtureManifest = {
  runId: string;
  outputDir: string;
  fixtures: Record<
    string,
    { path: string; byteSize: number; sha256: string; tokens?: string[] }
  >;
};

const manifestCache = new Map<string, UploadFixtureManifest>();

export function ensureUploadFixtures(runId: string, profile: string) {
  const key = `${runId}:${profile}`;
  const cached = manifestCache.get(key);
  if (cached) return cached;

  execFileSync(
    process.execPath,
    [
      path.resolve("scripts/generate-upload-e2e-fixtures.mjs"),
      "--run-id",
      runId,
      "--profile",
      profile,
    ],
    { stdio: "inherit" },
  );

  const manifestPath = path.resolve("e2e/.generated", runId, "manifest.json");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as UploadFixtureManifest;
  manifestCache.set(key, manifest);
  return manifest;
}

import { spawnSync } from "node:child_process";
import path from "node:path";

if (process.env.VERCEL !== "1") {
  console.log("[convex-env-sync] Skipped outside Vercel.");
  process.exit(0);
}

if (!process.env.CONVEX_DEPLOY_KEY?.trim()) {
  throw new Error(
    "CONVEX_DEPLOY_KEY is required for a Vercel Convex deployment.",
  );
}

// Convex preview deployments do not inherit provider secrets automatically.
// Keep this list deliberately small: only server-side values required for the
// deployed chat path belong here. Values are passed directly to the CLI and
// are never printed or written to disk.
const requiredVariables = ["OPENAI_API_KEY", "CLERK_ISSUER_URL"];
const convexCli = path.resolve(
  process.cwd(),
  "node_modules/convex/bin/main.js",
);

for (const name of requiredVariables) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for the deployed chat backend.`);

  const result = spawnSync(
    process.execPath,
    [convexCli, "env", "set", name, value],
    {
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    const safeError = (
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      "Convex environment update failed."
    )
      .replaceAll(value, "[REDACTED]")
      .slice(0, 2_000);
    throw new Error(`[convex-env-sync] Could not set ${name}: ${safeError}`);
  }
  console.log(`[convex-env-sync] ${name} configured.`);
}

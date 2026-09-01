import fs from "node:fs";
import path from "node:path";
import { buildOperationsEnvelope } from "./lib/upload-e2e-operations.mjs";

const summaryPath = path.resolve(
  process.env.E2E_SUMMARY_PATH ??
    "playwright-report/upload-e2e-summary.json",
);
const outputPath = path.resolve(
  process.env.E2E_OPERATIONS_OUTPUT ??
    "playwright-report/upload-e2e-operations.json",
);

let summary = null;
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
} catch {
  // Setup and deployment failures can occur before Playwright writes a summary.
}

const envelope = buildOperationsEnvelope({ env: process.env, summary });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`);

console.log(
  JSON.stringify({
    event: "upload_e2e_operations_envelope_written",
    operatingState: envelope.operatingState,
    failureCode: envelope.failureCode,
    output: path.relative(process.cwd(), outputPath),
  }),
);

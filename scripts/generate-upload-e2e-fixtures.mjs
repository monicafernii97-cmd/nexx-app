import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const runId = args.get("--run-id") ?? `e2e-pr-${Date.now()}-localtest`;
const profile = args.get("--profile") ?? "pr";
if (
  !/^e2e-(?:pr|release|daily|weekly|resilience)-[a-z0-9-]{8,96}$/.test(runId)
) {
  throw new Error(`Invalid E2E run id: ${runId}`);
}

const outputDir = path.resolve("e2e/.generated", runId);
fs.mkdirSync(outputDir, { recursive: true });
const prefix = `nexx-e2e-${runId}--`;
const fixtures = {};

function recordFixture(name, filePath, tokens) {
  const bytes = fs.readFileSync(filePath);
  fixtures[name] = {
    path: filePath,
    byteSize: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(tokens ? { tokens } : {}),
  };
}

function writeSizedText(name, targetBytes) {
  const filePath = path.join(outputDir, `${prefix}${name}.txt`);
  const header = `SYNTHETIC NEXX UPLOAD TEST\nRUN ${runId}\nFIXTURE ${name}\n`;
  const body = `${header}${"Synthetic upload content. ".repeat(Math.ceil(targetBytes / 26))}`;
  fs.writeFileSync(filePath, Buffer.from(body).subarray(0, targetBytes));
  recordFixture(name, filePath);
}

async function writePdf(name, targetBytes, pageCount, tokens = []) {
  const filePath = path.join(outputDir, `${prefix}${name}.pdf`);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([612, 792]);
    const pageToken = tokens
      .find((entry) => entry.startsWith(`${pageIndex + 1}:`))
      ?.split(":")
      .slice(1)
      .join(":");
    const lines = [
      "SYNTHETIC NEXX UPLOAD TEST DOCUMENT",
      `Run: ${runId}`,
      `Fixture: ${name}`,
      `Page: ${pageIndex + 1} of ${pageCount}`,
      pageToken
        ? `Verification token: ${pageToken}`
        : "No customer or legal information is contained in this file.",
    ];
    lines.forEach((line, lineIndex) =>
      page.drawText(line, {
        x: 54,
        y: 730 - lineIndex * 26,
        size: lineIndex === 0 ? 14 : 11,
        font,
        color: rgb(0.08, 0.12, 0.24),
      }),
    );
  }
  const pdfBytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  if (pdfBytes.byteLength >= targetBytes) {
    fs.writeFileSync(filePath, pdfBytes);
  } else {
    const padding = Buffer.alloc(targetBytes - pdfBytes.byteLength, 0x20);
    const marker = Buffer.from(`\n% NEXX E2E PADDING ${runId}\n`);
    marker.copy(padding, 0, 0, Math.min(marker.length, padding.length));
    fs.writeFileSync(filePath, Buffer.concat([pdfBytes, padding]));
  }
  recordFixture(
    name,
    filePath,
    tokens.map((entry) => entry.split(":").slice(1).join(":")),
  );
}

writeSizedText("small-20k", 20 * 1024);
fs.writeFileSync(
  path.join(outputDir, `${prefix}unsupported.exe`),
  Buffer.alloc(1024, 0x45),
);
recordFixture("unsupported", path.join(outputDir, `${prefix}unsupported.exe`));
fs.writeFileSync(
  path.join(outputDir, `${prefix}corrupt.pdf`),
  "%PDF-1.7\nSYNTHETIC CORRUPT FIXTURE\n%%EOF",
);
recordFixture("corrupt-pdf", path.join(outputDir, `${prefix}corrupt.pdf`));

if (["daily", "weekly", "resilience"].includes(profile)) {
  await writePdf("daily-250k", 250 * 1024, 3);
}
if (["release", "weekly", "resilience"].includes(profile)) {
  await writePdf("release-1m", 1024 * 1024, 5);
}
if (["weekly", "resilience"].includes(profile)) {
  await writePdf("medium-10m", 10 * 1024 * 1024, 20);
  await writePdf("maximum-24m", 24 * 1024 * 1024 + 512 * 1024, 30);
  const legalTokens = [
    "1:NEXX_BEGINNING_TOKEN_7A91",
    "50:NEXX_MIDDLE_TOKEN_4C28",
    "100:NEXX_END_TOKEN_9F63",
  ];
  await writePdf("legal-coverage", 2 * 1024 * 1024, 100, legalTokens);
  writeSizedText("oversize-25m", 25 * 1024 * 1024 + 1);
}

const manifest = { runId, outputDir, profile, fixtures };
fs.writeFileSync(
  path.join(outputDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  JSON.stringify({
    event: "upload_e2e_fixtures_generated",
    runId,
    profile,
    fixtureCount: Object.keys(fixtures).length,
  }),
);

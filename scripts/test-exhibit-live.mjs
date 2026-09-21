import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";

const runId = `exhibit-qa-${Date.now()}`;
function run(name, args, identity) {
  const command = [
    "node_modules/convex/bin/main.js",
    "run",
    name,
    JSON.stringify(args),
  ];
  if (identity)
    command.push(
      "--identity",
      JSON.stringify({
        subject: identity,
        issuer: "https://synthetic.invalid",
        tokenIdentifier: `https://synthetic.invalid|${identity}`,
      }),
    );
  const result = spawnSync(process.execPath, command, {
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status !== 0)
    throw new Error(`${name}: ${result.stderr || result.stdout}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
const checks = [];
const settings = {
  titleSheet: true,
  index: true,
  covers: true,
  summaries: true,
  dividers: false,
  labelStyle: "custom",
  prefix: "R2-R-MED",
  start: 1,
  bates: true,
  batesPrefix: "QA-",
  batesStart: 101,
  batesPadding: 5,
  coverLetter: "Synthetic verification packet. Not real case evidence.",
};
let seeded = false;
try {
  const fixture = run("exhibitStudioQAFixture:create", { runId });
  seeded = true;
  const sources = run(
    "exhibitStudio:importSources",
    {
      caseId: fixture.caseId,
      fileIds: [fixture.fileId],
      timelineIds: [],
      noteIds: [],
    },
    fixture.subject,
  );
  const items = [
    {
      id: "qa-exhibit-1",
      sourceId: sources[0],
      title: "Selected original conversation",
      date: "2026-03-12",
      classification: "Medical communications",
      pages: [2, 3],
    },
  ];
  const classificationId=run('exhibitClassifications:save',{caseId:fixture.caseId,name:'Written appointment confirmation',code:'APPT',definition:'Messages explicitly confirming an appointment date or time.',revision:0},fixture.subject);
  items[0].classifications=[{id:classificationId,name:'Written appointment confirmation',definition:'Messages explicitly confirming an appointment date or time.',revision:1}];
  const saved = run(
    "exhibitStudio:saveCollection",
    {
      caseId: fixture.caseId,
      title: "Synthetic Exhibit Studio QA",
      itemsJson: JSON.stringify(items),
      settingsJson: JSON.stringify(settings),
      expectedRevision: 0,
      operationId: `${runId}-save`,
    },
    fixture.subject,
  );
  checks.push("Authenticated source import and persisted collection");
  run('exhibitClassifications:save',{caseId:fixture.caseId,id:classificationId,name:'Appointment communications',code:'APPT',definition:'Broader appointment-related communications.',revision:1},fixture.subject);
  const pinned=run('exhibitStudio:overview',{caseId:fixture.caseId},fixture.subject).collections.find(c=>c._id===saved.id);
  if(JSON.parse(pinned.itemsJson)[0].classifications[0].name!=='Written appointment confirmation')throw new Error('Classification edit rewrote pinned assignments');
  checks.push('Case classification revisions preserve existing excerpt assignments');
  const duplicate = run(
    "exhibitStudio:saveCollection",
    {
      caseId: fixture.caseId,
      title: "Synthetic Exhibit Studio QA",
      itemsJson: JSON.stringify(items),
      settingsJson: JSON.stringify(settings),
      expectedRevision: 0,
      operationId: `${runId}-save`,
    },
    fixture.subject,
  );
  if (duplicate.id !== saved.id || duplicate.revision !== saved.revision)
    throw new Error("Idempotency failed");
  checks.push("Idempotent save");
  let denied = false;
  try {
    run(
      "exhibitStudio:overview",
      { caseId: fixture.caseId },
      `${runId}-outsider`,
    );
  } catch {
    denied = true;
  }
  if (!denied) throw new Error("Unauthorized case read allowed");
  checks.push("Unauthorized case read rejected");
  const candidateId = run(
    "exhibitStudio:generate",
    {
      collectionId: saved.id,
      revision: saved.revision,
      operationId: `runId-generate`,
    },
    fixture.subject,
  );
  let candidate;
  for (let i = 0; i < 30; i++) {
    const rows = run(
      "exhibitStudio:candidates",
      { collectionId: saved.id },
      fixture.subject,
    );
    candidate = rows.find((c) => c._id === candidateId);
    if (["ready", "failed", "cancelled"].includes(candidate?.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (candidate?.status !== "ready")
    throw new Error(`Generation ${candidate?.status}: ${candidate?.error}`);
  const access = run(
    "exhibitStudio:downloadAccess",
    { id: candidateId, kind: "packet" },
    fixture.subject,
  );
  const bytes = new Uint8Array(await (await fetch(access.url)).arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== candidate.sha256)
    throw new Error("Stored artifact hash mismatch");
  const pdf = await PDFDocument.load(bytes),
    report = JSON.parse(candidate.reportJson);
  if (pdf.getPageCount() !== report.pageCount || report.evidencePageCount !== 2)
    throw new Error("Final page map mismatch");
  if (
    report.pages
      .filter((p) => p.role === "evidence")
      .map((p) => p.sourcePage)
      .join(",") !== "2,3"
  )
    throw new Error("Wrong source pages");
  if (
    report.pages
      .filter((p) => p.role === "evidence")
      .map((p) => p.bates)
      .join(",") !== "QA-00101,QA-00102"
  )
    throw new Error("Bates mismatch");
  checks.push(
    "Scheduled live worker generated original page subset, index, covers and Bates",
  );
  run("exhibitStudioQA:fault", {
    runId,
    collectionId: saved.id,
    mode: "remove-source",
  });
  let removedBlocked = false;
  try {
    run(
      "exhibitStudio:finalize",
      { id: candidateId, sha256: sha },
      fixture.subject,
    );
  } catch {
    removedBlocked = true;
  }
  if (!removedBlocked) throw new Error("Removed source allowed finalization");
  run("exhibitStudioQA:fault", {
    runId,
    collectionId: saved.id,
    mode: "restore-source",
  });
  checks.push("Source removal before finalization blocked publication");
  run(
    "exhibitStudio:finalize",
    { id: candidateId, sha256: sha },
    fixture.subject,
  );
  checks.push("Exact reviewed candidate finalized");
  const subset = run(
    "exhibitStudio:addToCollection",
    {
      caseId: fixture.caseId,
      title: "Synthetic focused collection",
      itemsJson: JSON.stringify(items),
      expectedRevision: 0,
      operationId: `${runId}-subset`,
    },
    fixture.subject,
  );
  if (subset.id === saved.id)
    throw new Error("Subset modified original collection");
  checks.push("Independent collection created from selected evidence");
  const final = run(
    "exhibitStudio:candidates",
    { collectionId: saved.id },
    fixture.subject,
  ).find((c) => c._id === candidateId);
  if (final.sha256 !== sha || final.status !== "finalized")
    throw new Error("Final version changed");
  checks.push("Finalized version remained immutable");
  let conflict = false;
  try {
    run(
      "exhibitStudio:saveCollection",
      {
        id: saved.id,
        caseId: fixture.caseId,
        title: "Stale write",
        itemsJson: JSON.stringify(items),
        settingsJson: JSON.stringify(settings),
        expectedRevision: 0,
        operationId: `${runId}-stale`,
      },
      fixture.subject,
    );
  } catch {
    conflict = true;
  }
  if (!conflict) throw new Error("Stale revision overwrote collection");
  checks.push("Concurrent stale write rejected");
  const redacted = run(
    "exhibitStudio:saveCollection",
    {
      id: subset.id,
      caseId: fixture.caseId,
      title: "Synthetic redacted derivative",
      itemsJson: JSON.stringify([
        {
          ...items[0],
          pages: [2],
          redactions: [
            { page: 2, region: { x: 0, y: 0, width: 1, height: 1 } },
          ],
        },
      ]),
      settingsJson: JSON.stringify(settings),
      expectedRevision: subset.revision,
      operationId: `${runId}-redact`,
    },
    fixture.subject,
  );
  const redactedId = run(
    "exhibitStudio:generate",
    {
      collectionId: redacted.id,
      revision: redacted.revision,
      operationId: `${runId}-redact-generate`,
    },
    fixture.subject,
  );
  let derivative;
  for (let i = 0; i < 40; i++) {
    derivative = run(
      "exhibitStudio:candidates",
      { collectionId: redacted.id },
      fixture.subject,
    ).find((c) => c._id === redactedId);
    if (["ready", "failed"].includes(derivative?.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (derivative?.status !== "ready")
    throw new Error(`Live redaction failed: ${derivative?.error}`);
  let reviewBlocked = false;
  try {
    run(
      "exhibitStudio:finalize",
      { id: redactedId, sha256: derivative.sha256 },
      fixture.subject,
    );
  } catch {
    reviewBlocked = true;
  }
  if (!reviewBlocked) throw new Error("Unreviewed redaction finalized");
  run(
    "exhibitStudio:finalize",
    { id: redactedId, sha256: derivative.sha256, redactionsReviewed: true },
    fixture.subject,
  );
  checks.push(
    "Live pixel redaction generated; finalization required separate review",
  );
  const assisted = run(
    "exhibitAssistant:respond",
    {
      collectionId: saved.id,
      message:
        "Rename this collection to Synthetic Assistant Rename. Apply this change now.",
    },
    fixture.subject,
  );
  if (!assisted.changed)
    throw new Error("Assistant did not perform the explicit rename");
  const updated = run(
    "exhibitStudio:overview",
    { caseId: fixture.caseId },
    fixture.subject,
  ).collections.find((c) => c._id === saved.id);
  if (updated.title !== "Synthetic Assistant Rename")
    throw new Error("Assistant rename not persisted");
  const actionMessage = run(
    "exhibitStudio:assistantHistory",
    { collectionId: saved.id },
    fixture.subject,
  ).find((m) => m.operationId);
  if (!actionMessage) throw new Error("Missing assistant undo operation");
  run(
    "exhibitStudio:undo",
    { operationId: actionMessage.operationId },
    fixture.subject,
  );
  checks.push(
    "Live assistant executed a scoped rename and its operation was undone",
  );
  const cancelledId = run("exhibitStudioQA:fault", {
    runId,
    collectionId: saved.id,
    mode: "cancel",
  });
  run("exhibitStudio:cancel", { id: cancelledId }, fixture.subject);
  if (run("exhibitStudio:claim", { id: cancelledId }) !== null)
    throw new Error("Cancelled job was claimed");
  checks.push("Cancelled job cannot be claimed by a delayed worker");
  const recoveredId = run("exhibitStudioQA:fault", {
    runId,
    collectionId: saved.id,
    mode: "expired",
  });
  let recovered;
  for (let i = 0; i < 40; i++) {
    recovered = run(
      "exhibitStudio:candidates",
      { collectionId: saved.id },
      fixture.subject,
    ).find((c) => c._id === recoveredId);
    if (["ready", "failed"].includes(recovered?.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (recovered?.status !== "ready" || recovered.attempts !== 2)
    throw new Error(`Expired lease did not recover: ${recovered?.status}`);
  if (
    run("exhibitStudio:heartbeat", {
      id: recoveredId,
      attempt: 1,
      stage: "Stale worker",
    })
  )
    throw new Error("Stale attempt retained its lease");
  checks.push(
    "Expired worker recovered on attempt two; stale attempt fenced out",
  );
  await mkdir("output/exhibit-qa", { recursive: true });
  await writeFile("output/exhibit-qa/live-packet.pdf", bytes);
  await writeFile(
    "output/exhibit-qa/live-report.json",
    JSON.stringify({ runId, checks, report, sha256: sha }, null, 2),
  );
  console.log(
    JSON.stringify(
      { status: "passed", checks, pageCount: report.pageCount },
      null,
      2,
    ),
  );
} finally {
  if (seeded) run("exhibitStudioQA:cleanup", { runId });
}

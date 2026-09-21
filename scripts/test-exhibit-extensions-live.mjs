import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
const exec = promisify(execFile),
  runId = `exhibit-qa-extensions-${Date.now()}`,
  checks = [];
async function run(name, args, identity) {
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
  const r = await exec(process.execPath, command, { timeout: 120000 });
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}
async function until(fn, ready) {
  for (let i = 0; i < 40; i++) {
    const r = await fn();
    if (ready(r)) return r;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw Error("Timed out waiting for job.");
}
let seeded = false;
try {
  const f = await run("exhibitStudioQAFixture:create", { runId });
  seeded = true;
  const [sourceId] = await run(
    "exhibitStudio:importSources",
    { caseId: f.caseId, fileIds: [f.fileId], timelineIds: [], noteIds: [] },
    f.subject,
  );
  const seriesId = await run(
    "exhibitBates:create",
    {
      caseId: f.caseId,
      name: "Synthetic shared series",
      prefix: "QA-",
      padding: 6,
      start: 100,
    },
    f.subject,
  );
  const settings = {
    titleSheet: true,
    index: true,
    covers: true,
    summaries: true,
    dividers: false,
    labelStyle: "alpha",
    prefix: "A",
    start: 1,
    bates: true,
    batesPrefix: "IGNORED-",
    batesStart: 1,
    batesPadding: 5,
    batesSeriesId: seriesId,
    coverLetter: "",
  };
  const collections = await Promise.all(
    [0, 1].map((i) =>
      run(
        "exhibitStudio:saveCollection",
        {
          caseId: f.caseId,
          title: `Synthetic extension packet ${i}`,
          itemsJson: JSON.stringify([
            {
              id: `item-${i}`,
              sourceId,
              title: `Source ${i}`,
              pages: [1 + i * 2, 2 + i * 2],
            },
          ]),
          settingsJson: JSON.stringify(settings),
          expectedRevision: 0,
          operationId: `${runId}-save-${i}`,
        },
        f.subject,
      ),
    ),
  );
  const ids = await Promise.all(
    collections.map((c, i) =>
      run(
        "exhibitStudio:generate",
        {
          collectionId: c.id,
          revision: c.revision,
          operationId: `${runId}-generate-${i}`,
        },
        f.subject,
      ),
    ),
  );
  const packets = await Promise.all(
    collections.map((c, i) =>
      until(
        async () =>
          (
            await run(
              "exhibitStudio:candidates",
              { collectionId: c.id },
              f.subject,
            )
          ).find((p) => p._id === ids[i]),
        (p) => ["ready", "failed"].includes(p?.status),
      ),
    ),
  );
  for (const p of packets) if (p.status !== "ready") throw Error(p.error);
  const ledger = await run("exhibitBates:ledger", { seriesId }, f.subject);
  if (
    ledger.length !== 2 ||
    ledger.some((r) => r.count !== 2) ||
    Math.min(ledger[0].end, ledger[1].end) >=
      Math.max(ledger[0].start, ledger[1].start)
  )
    throw Error("Overlapping shared Bates reservations");
  for (const p of packets) {
    const r = ledger.find((r) => r.candidateId === p._id),
      stamps = JSON.parse(p.reportJson)
        .pages.filter((p) => p.bates)
        .map((p) => p.bates);
    if (
      stamps.join(",") !==
      [r.start, r.end].map((n) => `QA-${String(n).padStart(6, "0")}`).join(",")
    )
      throw Error("Reserved range differs from PDF report");
  }
  checks.push("Concurrent packet workers allocate disjoint exact Bates ranges");
  await run(
    "exhibitStudio:finalize",
    { id: ids[0], sha256: packets[0].sha256 },
    f.subject,
  );
  if (
    !(await run("exhibitBates:ledger", { seriesId }, f.subject)).find(
      (r) => r.candidateId === ids[0] && r.status === "committed",
    )
  )
    throw Error("Reservation was not committed");
  checks.push("Finalization commits the matching reservation");
  const pending = await run("exhibitStudioQA:fault", {
    runId,
    collectionId: collections[1].id,
    mode: "cancel",
  });
  const attempt = await run("exhibitStudio:claim", { id: pending });
  const reservation = await run("exhibitBates:reserve", {
    candidateId: pending,
    attempt,
    count: 2,
  });
  const retry = await run("exhibitBates:reserve", {
    candidateId: pending,
    attempt,
    count: 2,
  });
  if (reservation.reservationId !== retry.reservationId)
    throw Error("Retry allocated another range");
  await run("exhibitStudio:cancel", { id: pending }, f.subject);
  if (
    !(await run("exhibitBates:ledger", { seriesId }, f.subject)).find(
      (r) => r.candidateId === pending && r.status === "void",
    )
  )
    throw Error("Cancelled reservation not void");
  checks.push(
    "Retry reuses reservation and cancellation leaves a permanent void range",
  );
  const options = {
    candidateId: ids[0],
    operationId: `${runId}-delivery`,
    settingsJson: JSON.stringify({
      individual: true,
      volumes: true,
      maxPages: 10,
      allowSplit: true,
    }),
  };
  const deliveryId = await run("exhibitDelivery:request", options, f.subject);
  if ((await run("exhibitDelivery:request", options, f.subject)) !== deliveryId)
    throw Error("Duplicate delivery job");
  const delivery = await until(
    async () =>
      (
        await run("exhibitDelivery:list", { candidateId: ids[0] }, f.subject)
      ).find((d) => d._id === deliveryId),
    (d) => ["ready", "failed"].includes(d?.status),
  );
  if (delivery.status !== "ready") throw Error(delivery.error);
  const index = delivery.artifacts.findIndex((a) =>
      a.filename.endsWith(".zip"),
    ),
    access = await run(
      "exhibitDelivery:download",
      { id: deliveryId, index },
      f.subject,
    );
  const bytes = new Uint8Array(await (await fetch(access.url)).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== access.sha256)
    throw Error("Delivery checksum mismatch");
  const zip = await JSZip.loadAsync(bytes),
    master = await zip.file("master.pdf").async("uint8array");
  if (createHash("sha256").update(master).digest("hex") !== packets[0].sha256)
    throw Error("Master changed in ZIP");
  checks.push(
    "Live delivery job is idempotent and ZIP contains the byte-identical finalized master",
  );
  let denied = false;
  try {
    await run(
      "exhibitDelivery:download",
      { id: deliveryId, index },
      `${runId}-outsider`,
    );
  } catch {
    denied = true;
  }
  if (!denied) throw Error("Outsider downloaded delivery");
  checks.push("Unauthorized delivery access rejected");
  const series = (
    await run("exhibitBates:list", { caseId: f.caseId }, f.subject)
  ).find((s) => s._id === seriesId);
  if (series.next !== 106)
    throw Error("Delivery unexpectedly allocated Bates numbers");
  const cancelled = await run("exhibitStudioQA:deliveryFault", {
    runId,
    candidateId: ids[0],
    mode: "cancel",
  });
  await run("exhibitDelivery:cancel", { id: cancelled }, f.subject);
  if ((await run("exhibitDelivery:claim", { id: cancelled })) !== null)
    throw Error("Cancelled delivery worker claimed job");
  const recovering = await run("exhibitStudioQA:deliveryFault", {
    runId,
    candidateId: ids[0],
    mode: "expired",
  });
  const recovered = await until(
    async () =>
      (
        await run("exhibitDelivery:list", { candidateId: ids[0] }, f.subject)
      ).find((d) => d._id === recovering),
    (d) => ["ready", "failed"].includes(d?.status),
  );
  if (recovered.status !== "ready" || recovered.attempts !== 2)
    throw Error("Interrupted delivery failed to recover");
  if (
    await run("exhibitDelivery:heartbeat", {
      id: recovering,
      attempt: 1,
      stage: "Stale attempt",
    })
  )
    throw Error("Stale delivery worker retained lease");
  checks.push(
    "Delivery cancellation and lease recovery fence stale workers without allocating more Bates numbers",
  );
  const requestId = await run(
    "exhibitStudio:recordAssistantRequest",
    {
      collectionId: collections[1].id,
      exhibitId: "item-1",
      content: "Suggest a title for this synthetic exhibit.",
    },
    f.subject,
  );
  const proposal = await run("exhibitStudio:recordAssistantResponse", {
    requestId,
    content: "Synthetic title suggestion",
    proposalJson: JSON.stringify({ title: "Reviewed synthetic title" }),
    proposalRevision: collections[1].revision,
  });
  await run(
    "exhibitStudio:decideProposal",
    { messageId: proposal, decision: "accepted" },
    f.subject,
  );
  const accepted = (
    await run(
      "exhibitStudio:assistantHistory",
      { collectionId: collections[1].id },
      f.subject,
    )
  ).find((m) => m._id === proposal);
  if (accepted.proposalDecision !== "accepted" || !accepted.operationId)
    throw Error("Proposal acceptance not recorded");
  await run(
    "exhibitStudio:undo",
    { operationId: accepted.operationId },
    f.subject,
  );
  const stale = await run("exhibitStudio:recordAssistantResponse", {
    requestId,
    content: "Stale synthetic suggestion",
    proposalJson: JSON.stringify({ title: "Do not apply" }),
    proposalRevision: collections[1].revision,
  });
  let staleBlocked = false;
  try {
    await run(
      "exhibitStudio:decideProposal",
      { messageId: stale, decision: "accepted" },
      f.subject,
    );
  } catch {
    staleBlocked = true;
  }
  if (!staleBlocked) throw Error("Stale proposal overwrote newer edits");
  await run(
    "exhibitStudio:decideProposal",
    { messageId: stale, decision: "rejected" },
    f.subject,
  );
  checks.push(
    "Proposal acceptance is recorded and undoable; stale suggestions cannot overwrite newer edits",
  );
  await mkdir("output/exhibit-extensions", { recursive: true });
  await writeFile("output/exhibit-extensions/live-delivery.zip", bytes);
  await writeFile(
    "output/exhibit-extensions/live-report.json",
    JSON.stringify({ runId, checks }, null, 2),
  );
  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
} finally {
  if (seeded) await run("exhibitStudioQA:cleanup", { runId });
}

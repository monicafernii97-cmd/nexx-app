/** Internal, opt-in synthetic fixture support. Never accepts arbitrary user/case IDs. */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { cleanupCandidateExtensions } from "./lib/exhibitExtensionCleanup";
function guard(runId: string) {
  if (
    process.env.EXHIBIT_STUDIO_QA_ENABLED !== "true" ||
    process.env.CONVEX_CLOUD_URL?.includes("blessed-rabbit-457")
  )
    throw new Error("Synthetic fixture support is disabled.");
  if (!/^exhibit-qa-[a-z0-9-]{8,80}$/.test(runId))
    throw new Error("Invalid synthetic run ID.");
}
export const deliveryFault = internalMutation({
  args: {
    runId: v.string(),
    candidateId: v.id("exhibitCandidates"),
    mode: v.union(v.literal("cancel"), v.literal("expired")),
  },
  handler: async (ctx, { runId, candidateId, mode }) => {
    guard(runId);
    const p = await ctx.db.get(candidateId),
      u = p ? await ctx.db.get(p.userId) : null;
    if (
      !p ||
      p.status !== "finalized" ||
      u?.clerkId !== runId ||
      u.name !== "Synthetic Exhibit QA"
    )
      throw new Error("Synthetic finalized packet required.");
    const id = await ctx.db.insert("exhibitDeliveries", {
      userId: p.userId,
      caseId: p.caseId,
      candidateId,
      operationId: `${runId}-delivery-${mode}`,
      settingsJson: JSON.stringify({
        individual: false,
        volumes: false,
        maxPages: 100,
        allowSplit: false,
      }),
      parentSha256: p.sha256!,
      status: mode === "expired" ? "running" : "queued",
      attempts: mode === "expired" ? 1 : 0,
      leaseUntil: mode === "expired" ? Date.now() - 1 : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (mode === "expired")
      await ctx.scheduler.runAfter(0, internal.exhibitDelivery.expire, { id });
    else
      await ctx.scheduler.runAfter(15000, internal.exhibitDeliveryWorker.run, {
        id,
      });
    return id;
  },
});
export const seed = internalMutation({
  args: { runId: v.string(), storageId: v.id("_storage"), sha256: v.string() },
  handler: async (ctx, args) => {
    guard(args.runId);
    const userId = await ctx.db.insert("users", {
      clerkId: args.runId,
      name: "Synthetic Exhibit QA",
      role: "parent",
      onboardingComplete: true,
      createdAt: Date.now(),
    });
    const caseId = await ctx.db.insert("cases", {
      userId,
      title: args.runId,
      description: "Synthetic exhibit test only",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const fileId = await ctx.db.insert("uploadedFiles", {
      clerkUserId: args.runId,
      caseId,
      filename: "synthetic-original.pdf",
      mimeType: "application/pdf",
      storageId: args.storageId,
      storageSha256: args.sha256,
      status: "ready",
      createdAt: Date.now(),
    });
    const generationId = await ctx.db.insert("documentMemoryGenerations", {
      clerkUserId: args.runId,
      caseId,
      uploadedFileId: fileId,
      generationNumber: 1,
      status: "active",
      reason: "initial_upload",
      sourceFileHash: args.sha256,
      extractionPlan: { nativeExtraction: true, mistralOcr: false },
      counts: { pagesStored: 1 },
      qualitySummary: { warnings: [] },
      validation: { passed: true, checks: ["fixture"], failedChecks: [] },
      createdAt: Date.now(),
    });
    const text =
      "SYNTHETIC ORIGINAL PAGE 2\nMarch 12, 2026 - Synthetic appointment conversation";
    await ctx.db.insert("documentPages", {
      uploadedFileId: fileId,
      memoryGenerationId: generationId,
      clerkUserId: args.runId,
      caseId,
      pageNumber: 2,
      text,
      textLength: text.length,
      warnings: [],
      isSynthetic: false,
      createdAt: Date.now(),
    });
    await ctx.db.patch(fileId, { activeMemoryGenerationId: generationId });
    const otherCaseId = await ctx.db.insert("cases", {
      userId,
      title: args.runId,
      description: "Synthetic cross-case fixture",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const otherSourceId = await ctx.db.insert("exhibitSources", {
      userId,
      caseId: otherCaseId,
      title: "Other case synthetic note",
      kind: "note",
      originId: "fixture",
      mimeType: "text/plain",
      snapshot: "Other case only",
      createdAt: Date.now(),
    });
    return { caseId, fileId, subject: args.runId, otherSourceId };
  },
});
/** Fault injection is limited to this run's synthetic owner and collection. */
export const fault = internalMutation({
  args: {
    runId: v.string(),
    collectionId: v.id("exhibitCollections"),
    mode: v.union(
      v.literal("cancel"),
      v.literal("expired"),
      v.literal("remove-source"),
      v.literal("restore-source"),
      v.literal("ocr-replace"),
    ),
  },
  handler: async (ctx, { runId, collectionId, mode }) => {
    guard(runId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", runId))
      .first();
    const collection = await ctx.db.get(collectionId);
    if (
      !user ||
      user.name !== "Synthetic Exhibit QA" ||
      collection?.userId !== user._id
    )
      throw new Error("Synthetic ownership required.");
    if (mode === "ocr-replace") {
      const files = await ctx.db
        .query("uploadedFiles")
        .withIndex("by_clerk_case", (q) =>
          q.eq("clerkUserId", runId).eq("caseId", collection.caseId),
        )
        .collect();
      for (const file of files) {
        if (!file.activeMemoryGenerationId) continue;
        const old = await ctx.db.get(file.activeMemoryGenerationId);
        if (!old) continue;
        const { _id: _, _creationTime: __, ...data } = old;
        const generationId = await ctx.db.insert("documentMemoryGenerations", {
          ...data,
          generationNumber: old.generationNumber + 1,
          createdAt: Date.now(),
        });
        await ctx.db.patch(old._id, { status: "retired" });
        await ctx.db.patch(file._id, {
          activeMemoryGenerationId: generationId,
        });
      }
      return null;
    }
    if (mode === "remove-source" || mode === "restore-source") {
      const files = await ctx.db
        .query("uploadedFiles")
        .withIndex("by_clerk_case", (q) =>
          q.eq("clerkUserId", runId).eq("caseId", collection.caseId),
        )
        .collect();
      for (const file of files)
        await ctx.db.patch(file._id, {
          deletedAt: mode === "remove-source" ? Date.now() : undefined,
        });
      return null;
    }
    const now = Date.now();
    const id = await ctx.db.insert("exhibitCandidates", {
      userId: user._id,
      caseId: collection.caseId,
      collectionId,
      revision: collection.revision,
      title: collection.title,
      itemsJson: collection.itemsJson,
      settingsJson: collection.settingsJson,
      status: mode === "expired" ? "generating" : "queued",
      operationId: `${runId}-${mode}`,
      attempts: mode === "expired" ? 1 : 0,
      leaseUntil: mode === "expired" ? now - 1 : undefined,
      createdAt: now,
      updatedAt: now,
    });
    if (mode === "expired")
      await ctx.scheduler.runAfter(0, internal.exhibitStudio.expire, { id });
    else
      await ctx.scheduler.runAfter(15000, internal.exhibitWorker.generate, {
        id,
      });
    return id;
  },
});
export const cleanup = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    guard(runId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", runId))
      .first();
    if (!user) return;
    if (user.name !== "Synthetic Exhibit QA")
      throw new Error("Refusing to remove a non-synthetic identity.");
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const c of cases) {
      if (c.title !== runId) throw new Error("Unexpected fixture ownership.");
      for (const anchor of await ctx.db
        .query("exhibitTextAnchors")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect())
        await ctx.db.delete(anchor._id);
      for (const classification of await ctx.db
        .query("exhibitClassifications")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect())
        await ctx.db.delete(classification._id);
      const collections = await ctx.db
        .query("exhibitCollections")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect();
      for (const col of collections) {
        const candidates = await ctx.db
          .query("exhibitCandidates")
          .withIndex("by_collection", (q) => q.eq("collectionId", col._id))
          .collect();
        for (const candidate of candidates) {
          if (["queued", "generating"].includes(candidate.status))
            throw new Error("Wait for running packet jobs before cleanup.");
          if (candidate.storageId)
            await ctx.storage.delete(candidate.storageId);
          if (candidate.indexStorageId)
            await ctx.storage.delete(candidate.indexStorageId);
          await cleanupCandidateExtensions(ctx, candidate._id);
          await ctx.db.delete(candidate._id);
        }
        for (const message of await ctx.db
          .query("exhibitMessages")
          .withIndex("by_collection", (q) => q.eq("collectionId", col._id))
          .collect())
          await ctx.db.delete(message._id);
        await ctx.db.delete(col._id);
      }
      for (const source of await ctx.db
        .query("exhibitSources")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect())
        await ctx.db.delete(source._id);
      for (const file of await ctx.db
        .query("uploadedFiles")
        .withIndex("by_clerk_case", (q) =>
          q.eq("clerkUserId", runId).eq("caseId", c._id),
        )
        .collect()) {
        for (const page of await ctx.db
          .query("documentPages")
          .withIndex("by_uploaded_file_page", (q) =>
            q.eq("uploadedFileId", file._id),
          )
          .collect())
          await ctx.db.delete(page._id);
        for (const generation of await ctx.db
          .query("documentMemoryGenerations")
          .withIndex("by_file_generation", (q) =>
            q.eq("uploadedFileId", file._id),
          )
          .collect())
          await ctx.db.delete(generation._id);
        if (file.storageId) await ctx.storage.delete(file.storageId);
        await ctx.db.delete(file._id);
      }
      for (const series of await ctx.db
        .query("exhibitBatesSeries")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect())
        await ctx.db.delete(series._id);
      await ctx.db.delete(c._id);
    }
    for (const op of await ctx.db
      .query("exhibitOperations")
      .withIndex("by_user_operation", (q) => q.eq("userId", user._id))
      .collect())
      await ctx.db.delete(op._id);
    await ctx.db.delete(user._id);
  },
});
export const cleanupBrowserRun = internalMutation({
  args: { runId: v.string(), subject: v.string() },
  handler: async (ctx, { runId, subject }) => {
    guard(runId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", subject))
      .first();
    if (
      !user ||
      !/^upload-robot-owner\+preview@nexproof\.io$/i.test(user.email ?? "")
    )
      throw new Error("Only the approved preview robot can use this cleanup.");
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const c of cases) {
      const fixtureFiles = await ctx.db
        .query("uploadedFiles")
        .withIndex("by_clerk_case", (q) =>
          q.eq("clerkUserId", subject).eq("caseId", c._id),
        )
        .collect();
      for (const file of fixtureFiles.filter(
        (f) => f.filename === `${runId}.pdf`,
      )) {
        for (const page of await ctx.db
          .query("documentPages")
          .withIndex("by_uploaded_file_page", (q) =>
            q.eq("uploadedFileId", file._id),
          )
          .collect())
          await ctx.db.delete(page._id);
        for (const generation of await ctx.db
          .query("documentMemoryGenerations")
          .withIndex("by_file_generation", (q) =>
            q.eq("uploadedFileId", file._id),
          )
          .collect())
          await ctx.db.delete(generation._id);
        for (const source of await ctx.db
          .query("exhibitSources")
          .withIndex("by_user_origin", (q) =>
            q.eq("userId", user._id).eq("originId", file._id),
          )
          .collect())
          await ctx.db.delete(source._id);
        if (file.storageId) await ctx.storage.delete(file.storageId);
        await ctx.db.delete(file._id);
      }
      const sources = new Set<string>();
      for (const col of await ctx.db
        .query("exhibitCollections")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect()) {
        if (col.userId !== user._id || !col.title.startsWith(runId)) continue;
        for (const item of JSON.parse(col.itemsJson) as { sourceId: string }[])
          sources.add(item.sourceId);
        for (const row of await ctx.db
          .query("exhibitCandidates")
          .withIndex("by_collection", (q) => q.eq("collectionId", col._id))
          .collect()) {
          if (["queued", "generating"].includes(row.status))
            throw new Error("Wait for synthetic packet generation to finish.");
          if (row.storageId) await ctx.storage.delete(row.storageId);
          if (row.indexStorageId) await ctx.storage.delete(row.indexStorageId);
          await cleanupCandidateExtensions(ctx, row._id);
          await ctx.db.delete(row._id);
        }
        for (const msg of await ctx.db
          .query("exhibitMessages")
          .withIndex("by_collection", (q) => q.eq("collectionId", col._id))
          .collect())
          await ctx.db.delete(msg._id);
        for (const op of await ctx.db
          .query("exhibitOperations")
          .withIndex("by_user_operation", (q) => q.eq("userId", user._id))
          .collect())
          if (op.collectionId === col._id) await ctx.db.delete(op._id);
        await ctx.db.delete(col._id);
      }
      for (const id of sources) {
        const normalized = ctx.db.normalizeId("exhibitSources", id);
        const source = normalized ? await ctx.db.get(normalized) : null;
        if (
          source &&
          source.userId === user._id &&
          ((source.kind === "timeline" && source.snapshot?.includes(runId)) ||
            (source.kind === "file" &&
              source.title === `nexx-e2e-e2e-pr-${runId}--original.pdf`))
        )
          await ctx.db.delete(source._id);
      }
      for (const anchor of await ctx.db
        .query("exhibitTextAnchors")
        .withIndex("by_case", (q) => q.eq("caseId", c._id))
        .collect())
        if (anchor.userId === user._id && sources.has(anchor.sourceId))
          await ctx.db.delete(anchor._id);
      for (const event of await ctx.db
        .query("timelineCandidates")
        .withIndex("by_userId_caseId", (q) =>
          q.eq("userId", user._id).eq("caseId", c._id),
        )
        .collect())
        if (event.title === runId) await ctx.db.delete(event._id);
    }
  },
});
export const seedBrowserFile = internalMutation({
  args: {
    runId: v.string(),
    subject: v.string(),
    storageId: v.id("_storage"),
    sha256: v.string(),
  },
  handler: async (ctx, args) => {
    guard(args.runId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", args.subject))
      .first();
    if (
      !user ||
      user.email?.toLowerCase() !== "upload-robot-owner+preview@nexproof.io"
    )
      throw new Error("Approved preview robot required.");
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const active = cases.find((c) => c.status === "active") ?? cases[0];
    if (!active) throw new Error("Test case missing.");
    const fileId = await ctx.db.insert("uploadedFiles", {
      clerkUserId: args.subject,
      caseId: active._id,
      filename: `${args.runId}.pdf`,
      mimeType: "application/pdf",
      storageId: args.storageId,
      storageSha256: args.sha256,
      status: "ready",
      createdAt: Date.now(),
    });
    const generationId = await ctx.db.insert("documentMemoryGenerations", {
      clerkUserId: args.subject,
      caseId: active._id,
      uploadedFileId: fileId,
      generationNumber: 1,
      status: "active",
      reason: "initial_upload",
      sourceFileHash: args.sha256,
      extractionPlan: { nativeExtraction: true, mistralOcr: false },
      counts: { pagesStored: 1 },
      qualitySummary: { warnings: [] },
      validation: { passed: true, checks: ["fixture"], failedChecks: [] },
      createdAt: Date.now(),
    });
    const text = "SYNTHETIC REGION TEST";
    await ctx.db.insert("documentPages", {
      uploadedFileId: fileId,
      memoryGenerationId: generationId,
      clerkUserId: args.subject,
      caseId: active._id,
      pageNumber: 1,
      text,
      textLength: text.length,
      warnings: [],
      isSynthetic: false,
      createdAt: Date.now(),
    });
    await ctx.db.patch(fileId, { activeMemoryGenerationId: generationId });
    return { fileId, caseId: active._id };
  },
});

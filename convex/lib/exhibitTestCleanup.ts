import type { MutationCtx } from "../_generated/server";
/** Extend the existing registered upload-test lifecycle; only approved robots and exact run prefixes. */
export async function cleanupExhibitTestRun(
  ctx: MutationCtx,
  clerkId: string,
  runId: string,
  filenamePrefix: string,
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
    .first();
  if (
    !user ||
    !/^upload-robot-(owner|outsider)\+(preview|production)@nexproof\.io$/i.test(
      user.email ?? "",
    )
  )
    return 0;
  if (
    !/^e2e-(pr|release|daily|weekly|resilience)-[a-z0-9-]{8,96}$/.test(runId) ||
    filenamePrefix !== `nexx-e2e-${runId}--`
  )
    throw new Error("Invalid exhibit test cleanup scope.");
  const cases = await ctx.db
    .query("cases")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .collect();
  let count = 0;
  for (const c of cases) {
    const sources = await ctx.db
      .query("exhibitSources")
      .withIndex("by_case", (q) => q.eq("caseId", c._id))
      .collect();
    const fixtureSources = sources.filter(
      (s) =>
        s.userId === user._id &&
        s.kind === "file" &&
        s.title.startsWith(filenamePrefix),
    );
    const ids = new Set(fixtureSources.map((s) => s._id as string));
    const collections = await ctx.db
      .query("exhibitCollections")
      .withIndex("by_case", (q) => q.eq("caseId", c._id))
      .collect();
    for (const collection of collections) {
      if (
        collection.userId !== user._id ||
        !collection.title.startsWith(`${runId} `)
      )
        continue;
      const items = JSON.parse(collection.itemsJson) as {
        sourceId: string;
        parts?: { sourceId: string }[];
      }[];
      if (
        items
          .flatMap((i) => [i, ...(i.parts ?? [])])
          .some((i) => !ids.has(i.sourceId))
      )
        throw new Error(
          "Synthetic exhibit collection contains evidence outside this run.",
        );
      const jobs = await ctx.db
        .query("exhibitCandidates")
        .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
        .collect();
      if (jobs.some((j) => ["queued", "generating"].includes(j.status)))
        throw new Error(
          "Wait for synthetic exhibit generation before cleanup.",
        );
      for (const job of jobs) {
        if (job.storageId) await ctx.storage.delete(job.storageId);
        if (job.indexStorageId) await ctx.storage.delete(job.indexStorageId);
        await ctx.db.delete(job._id);
      }
      for (const message of await ctx.db
        .query("exhibitMessages")
        .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
        .collect())
        await ctx.db.delete(message._id);
      for (const op of await ctx.db
        .query("exhibitOperations")
        .withIndex("by_user_operation", (q) => q.eq("userId", user._id))
        .collect())
        if (op.collectionId === collection._id) await ctx.db.delete(op._id);
      await ctx.db.delete(collection._id);
      count++;
    }
    for (const anchor of await ctx.db
      .query("exhibitTextAnchors")
      .withIndex("by_case", (q) => q.eq("caseId", c._id))
      .collect())
      if (anchor.userId === user._id && ids.has(anchor.sourceId))
        await ctx.db.delete(anchor._id);
    for (const source of fixtureSources) await ctx.db.delete(source._id);
  }
  return count;
}

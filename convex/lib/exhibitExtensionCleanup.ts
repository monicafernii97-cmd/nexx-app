import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
/** Called only by the existing ownership- and run-scoped synthetic cleanup paths. */
export async function cleanupCandidateExtensions(
  ctx: MutationCtx,
  candidateId: Id<"exhibitCandidates">,
) {
  for (const d of await ctx.db
    .query("exhibitDeliveries")
    .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
    .collect()) {
    if (["queued", "running"].includes(d.status))
      throw new Error(
        "Wait for synthetic delivery or cancel it before cleanup.",
      );
    for (const a of d.artifacts ?? []) await ctx.storage.delete(a.storageId);
    await ctx.db.delete(d._id);
  }
  for (const r of await ctx.db
    .query("exhibitBatesReservations")
    .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
    .collect())
    await ctx.db.delete(r._id);
}

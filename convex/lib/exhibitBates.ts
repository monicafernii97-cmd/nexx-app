import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function settleBates(
  ctx: MutationCtx,
  candidateId: Id<"exhibitCandidates">,
  status: "committed" | "void",
) {
  const r = await ctx.db
    .query("exhibitBatesReservations")
    .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
    .first();
  if (r && r.status === "reserved") await ctx.db.patch(r._id, { status });
}

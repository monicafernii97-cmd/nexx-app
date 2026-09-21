import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthenticatedUser, validateCaseOwnership } from "./lib/auth";
import { parseDeliverySettings } from "../shared/exhibitDelivery";
import { canonicalJSON } from "../shared/exhibits";
const artifact = v.object({
  filename: v.string(),
  storageId: v.id("_storage"),
  sha256: v.string(),
  mimeType: v.string(),
});
async function access(
  ctx: QueryCtx | MutationCtx,
  id: Id<"exhibitCandidates">,
) {
  const user = await getAuthenticatedUser(ctx),
    packet = await ctx.db.get(id);
  if (!packet || packet.userId !== user._id)
    throw new Error("Packet unavailable.");
  await validateCaseOwnership(ctx, packet.caseId, user._id);
  return packet;
}
export const list = query({
  args: { candidateId: v.id("exhibitCandidates") },
  handler: async (ctx, { candidateId }) => {
    await access(ctx, candidateId);
    return (
      await ctx.db
        .query("exhibitDeliveries")
        .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
        .order("desc")
        .take(20)
    ).map((r) => ({
      ...r,
      artifacts: r.artifacts?.map((a, i) => ({
        filename: a.filename,
        sha256: a.sha256,
        url: `/api/exhibit-deliveries/${r._id}/${i}`,
      })),
    }));
  },
});
export const request = mutation({
  args: {
    candidateId: v.id("exhibitCandidates"),
    operationId: v.string(),
    settingsJson: v.string(),
  },
  handler: async (ctx, args) => {
    if (process.env.EXHIBIT_STUDIO_ENABLED !== "true")
      throw new Error("Exhibit Studio is disabled.");
    const p = await access(ctx, args.candidateId);
    if (
      p.status !== "finalized" ||
      !p.sha256 ||
      !p.storageId ||
      !p.indexStorageId
    )
      throw new Error("Finalize a reviewed packet before preparing delivery.");
    if (!args.operationId || args.operationId.length > 100)
      throw new Error("Invalid operation ID.");
    const settingsJson = canonicalJSON(
      parseDeliverySettings(JSON.parse(args.settingsJson)),
    );
    const prior = await ctx.db
      .query("exhibitDeliveries")
      .withIndex("by_user_operation", (q) =>
        q.eq("userId", p.userId).eq("operationId", args.operationId),
      )
      .first();
    if (prior) {
      if (prior.candidateId !== p._id || prior.settingsJson !== settingsJson)
        throw new Error("Operation ID already used with different options.");
      return prior._id;
    }
    for (const status of ["queued", "running"] as const)
      if (
        (
          await ctx.db
            .query("exhibitDeliveries")
            .withIndex("by_user_status", (q) =>
              q.eq("userId", p.userId).eq("status", status),
            )
            .take(1)
        ).length
      )
        throw new Error(
          "Wait for your current delivery to finish or cancel it.",
        );
    const id = await ctx.db.insert("exhibitDeliveries", {
      userId: p.userId,
      caseId: p.caseId,
      candidateId: p._id,
      operationId: args.operationId,
      settingsJson,
      parentSha256: p.sha256,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.exhibitDeliveryWorker.run, { id });
    return id;
  },
});
export const cancel = mutation({
  args: { id: v.id("exhibitDeliveries") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) throw new Error("Delivery unavailable.");
    await access(ctx, job.candidateId);
    if (!["queued", "running"].includes(job.status))
      throw new Error("Delivery is no longer running.");
    await ctx.db.patch(id, {
      status: "cancelled",
      leaseUntil: undefined,
      updatedAt: Date.now(),
    });
  },
});
export const download = query({
  args: { id: v.id("exhibitDeliveries"), index: v.number() },
  handler: async (ctx, { id, index }) => {
    const j = await ctx.db.get(id);
    if (!j || j.status !== "ready") throw new Error("Delivery unavailable.");
    await access(ctx, j.candidateId);
    const a =
      Number.isSafeInteger(index) && index >= 0
        ? j.artifacts?.[index]
        : undefined;
    if (!a) throw new Error("Artifact unavailable.");
    return { ...a, url: await ctx.storage.getUrl(a.storageId) };
  },
});
export const input = internalQuery({
  args: { id: v.id("exhibitDeliveries") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "running") return null;
    await validateCaseOwnership(ctx, job.caseId, job.userId);
    const packet = await ctx.db.get(job.candidateId);
    if (
      !packet ||
      packet.status !== "finalized" ||
      packet.sha256 !== job.parentSha256
    )
      throw new Error("Parent packet changed or unavailable.");
    return { job, packet };
  },
});
export const claim = internalMutation({
  args: { id: v.id("exhibitDeliveries") },
  handler: async (ctx, { id }) => {
    const j = await ctx.db.get(id);
    if (!j || j.status !== "queued") return null;
    await ctx.db.patch(id, {
      status: "running",
      attempts: j.attempts + 1,
      leaseUntil: Date.now() + 360000,
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(360000, internal.exhibitDelivery.expire, {
      id,
    });
    return j.attempts + 1;
  },
});
export const heartbeat = internalMutation({
  args: {
    id: v.id("exhibitDeliveries"),
    attempt: v.number(),
    stage: v.string(),
  },
  handler: async (ctx, { id, attempt, stage }) => {
    const j = await ctx.db.get(id);
    if (!j || j.status !== "running" || j.attempts !== attempt) return false;
    await ctx.db.patch(id, {
      stage: stage.slice(0, 100),
      leaseUntil: Date.now() + 360000,
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("exhibitDeliveries"),
    attempt: v.number(),
    artifacts: v.array(artifact),
  },
  handler: async (ctx, { id, attempt, artifacts }) => {
    const j = await ctx.db.get(id);
    if (!j || j.status !== "running" || j.attempts !== attempt) return false;
    await validateCaseOwnership(ctx, j.caseId, j.userId);
    const p = await ctx.db.get(j.candidateId);
    if (!p || p.status !== "finalized" || p.sha256 !== j.parentSha256)
      throw new Error("Parent packet unavailable.");
    for (const a of artifacts)
      if (!(await ctx.db.system.get(a.storageId)))
        throw new Error("Delivery artifact missing.");
    await ctx.db.patch(id, {
      status: "ready",
      artifacts,
      leaseUntil: undefined,
      stage: "Ready",
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const cleanup = internalMutation({
  args: {
    id: v.id("exhibitDeliveries"),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, { id, storageIds }) => {
    const j = await ctx.db.get(id),
      published = new Set(j?.artifacts?.map((a) => a.storageId));
    for (const s of storageIds)
      if (!published.has(s)) await ctx.storage.delete(s);
  },
});
export const fail = internalMutation({
  args: {
    id: v.id("exhibitDeliveries"),
    attempt: v.number(),
    message: v.string(),
    retryable: v.boolean(),
  },
  handler: async (ctx, { id, attempt, message, retryable }) => {
    const j = await ctx.db.get(id);
    if (!j || j.status !== "running" || j.attempts !== attempt) return;
    const retry = retryable && j.attempts < 3;
    await ctx.db.patch(id, {
      status: retry ? "queued" : "failed",
      error: message.slice(0, 400),
      leaseUntil: undefined,
      updatedAt: Date.now(),
    });
    if (retry)
      await ctx.scheduler.runAfter(
        5000 * j.attempts,
        internal.exhibitDeliveryWorker.run,
        { id },
      );
  },
});
export const expire = internalMutation({
  args: { id: v.id("exhibitDeliveries") },
  handler: async (ctx, { id }) => {
    const j = await ctx.db.get(id);
    if (!j || j.status !== "running") return;
    if ((j.leaseUntil ?? 0) > Date.now()) {
      await ctx.scheduler.runAfter(
        j.leaseUntil! - Date.now(),
        internal.exhibitDelivery.expire,
        { id },
      );
      return;
    }
    const retry = j.attempts < 3;
    await ctx.db.patch(id, {
      status: retry ? "queued" : "failed",
      leaseUntil: undefined,
      error: retry ? undefined : "Delivery timed out after three attempts.",
      updatedAt: Date.now(),
    });
    if (retry)
      await ctx.scheduler.runAfter(0, internal.exhibitDeliveryWorker.run, {
        id,
      });
  },
});

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthenticatedUser, validateCaseOwnership } from "./lib/auth";
import { parseSettings } from "../shared/exhibits";
export const list = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const u = await getAuthenticatedUser(ctx);
    await validateCaseOwnership(ctx, caseId, u._id);
    return ctx.db
      .query("exhibitBatesSeries")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
  },
});
export const create = mutation({
  args: {
    caseId: v.id("cases"),
    name: v.string(),
    prefix: v.string(),
    padding: v.number(),
    start: v.number(),
  },
  handler: async (ctx, a) => {
    if (process.env.EXHIBIT_STUDIO_ENABLED !== "true")
      throw new Error("Exhibit Studio is disabled.");
    const u = await getAuthenticatedUser(ctx);
    await validateCaseOwnership(ctx, a.caseId, u._id);
    if (
      !a.name.trim() ||
      a.name.length > 100 ||
      !/^(?:[A-Za-z0-9][A-Za-z0-9_-]{0,28}[-_])?$/.test(a.prefix) ||
      !Number.isSafeInteger(a.padding) ||
      a.padding < 1 ||
      a.padding > 10 ||
      !Number.isSafeInteger(a.start) ||
      a.start < 0 ||
      a.start > 999999999
    )
      throw new Error(
        "Invalid Bates series. Use a prefix ending in a hyphen or underscore (or leave it blank), and a valid starting number.",
      );
    const existing = await ctx.db
      .query("exhibitBatesSeries")
      .withIndex("by_case", (q) => q.eq("caseId", a.caseId))
      .collect();
    if (existing.length >= 50)
      throw new Error("This case already has 50 Bates series.");
    if (
      existing.some(
        (s) =>
          s.name.toLowerCase() === a.name.trim().toLowerCase() ||
          s.prefix === a.prefix,
      )
    )
      throw new Error(
        "Series name and prefix must be unique in this case, including archived series.",
      );
    return ctx.db.insert("exhibitBatesSeries", {
      userId: u._id,
      caseId: a.caseId,
      name: a.name.trim(),
      prefix: a.prefix,
      padding: a.padding,
      next: a.start,
      archived: false,
      revision: 1,
      createdAt: Date.now(),
    });
  },
});
export const ledger = query({
  args: { seriesId: v.id("exhibitBatesSeries") },
  handler: async (ctx, { seriesId }) => {
    const u = await getAuthenticatedUser(ctx),
      s = await ctx.db.get(seriesId);
    if (!s || s.userId !== u._id) throw new Error("Series unavailable.");
    await validateCaseOwnership(ctx, s.caseId, u._id);
    return ctx.db
      .query("exhibitBatesReservations")
      .withIndex("by_series", (q) => q.eq("seriesId", seriesId))
      .order("desc")
      .take(100);
  },
});
export const archive = mutation({
  args: { seriesId: v.id("exhibitBatesSeries"), revision: v.number() },
  handler: async (ctx, { seriesId, revision }) => {
    const u = await getAuthenticatedUser(ctx),
      s = await ctx.db.get(seriesId);
    if (!s || s.userId !== u._id) throw new Error("Series unavailable.");
    await validateCaseOwnership(ctx, s.caseId, u._id);
    if (s.revision !== revision)
      throw new Error("Series changed. Reload before archiving.");
    await ctx.db.patch(seriesId, { archived: true, revision: revision + 1 });
  },
});
export const reserve = internalMutation({
  args: {
    candidateId: v.id("exhibitCandidates"),
    attempt: v.number(),
    count: v.number(),
  },
  handler: async (ctx, { candidateId, attempt, count }) => {
    const j = await ctx.db.get(candidateId);
    if (!j || j.status !== "generating" || j.attempts !== attempt)
      throw new Error("GENERATION_CANCELLED");
    await validateCaseOwnership(ctx, j.caseId, j.userId);
    if (!Number.isSafeInteger(count) || count < 1 || count > 500)
      throw new Error("Select at least one eligible Bates page type.");
    const settings = parseSettings(JSON.parse(j.settingsJson));
    const id = settings.batesSeriesId
      ? ctx.db.normalizeId("exhibitBatesSeries", settings.batesSeriesId)
      : null;
    const series = id ? await ctx.db.get(id) : null;
    if (!series || series.userId !== j.userId || series.caseId !== j.caseId)
      throw new Error("Bates series unavailable in this case.");
    const prior = await ctx.db
      .query("exhibitBatesReservations")
      .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
      .first();
    if (prior) {
      if (
        prior.seriesId !== series._id ||
        prior.count !== count ||
        prior.status !== "reserved"
      )
        throw new Error("BATES_RESERVATION_MISMATCH");
      return {
        start: prior.start,
        prefix: prior.prefix,
        padding: prior.padding,
        reservationId: prior._id,
      };
    }
    if (series.archived) throw new Error("Bates series is archived.");
    const end = series.next + count - 1;
    if (end > 999999999) throw new Error("Bates series exhausted.");
    const reservationId = await ctx.db.insert("exhibitBatesReservations", {
      userId: j.userId,
      caseId: j.caseId,
      candidateId,
      seriesId: series._id,
      start: series.next,
      end,
      count,
      prefix: series.prefix,
      padding: series.padding,
      status: "reserved",
      createdAt: Date.now(),
    });
    await ctx.db.patch(series._id, {
      next: end + 1,
      revision: series.revision + 1,
    });
    return {
      start: series.next,
      prefix: series.prefix,
      padding: series.padding,
      reservationId,
    };
  },
});

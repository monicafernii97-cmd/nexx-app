import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser, validateCaseOwnership } from "./lib/auth";
export const list = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await getAuthenticatedUser(ctx);
    await validateCaseOwnership(ctx, caseId, user._id);
    return ctx.db
      .query("exhibitClassifications")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
  },
});
export const save = mutation({
  args: {
    caseId: v.id("cases"),
    id: v.optional(v.id("exhibitClassifications")),
    name: v.string(),
    code: v.string(),
    definition: v.string(),
    revision: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    await validateCaseOwnership(ctx, args.caseId, user._id);
    const name = args.name.trim(),
      code = args.code.trim().toUpperCase(),
      definition = args.definition.trim();
    if (
      !name ||
      name.length > 120 ||
      code.length > 24 ||
      definition.length > 1000
    )
      throw new Error(
        "Use a name up to 120 characters, code up to 24, and definition up to 1,000.",
      );
    const rows = await ctx.db
      .query("exhibitClassifications")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    if (
      rows.some(
        (r) => r._id !== args.id && r.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("This classification already exists.");
    const now = Date.now();
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (
        !row ||
        row.caseId !== args.caseId ||
        row.userId !== user._id ||
        row.revision !== args.revision
      )
        throw new Error("Classification changed. Reload before editing.");
      await ctx.db.patch(args.id, {
        name,
        code,
        definition,
        revision: row.revision + 1,
        updatedAt: now,
      });
      return args.id;
    }
    if (rows.length >= 100)
      throw new Error("This case supports up to 100 classifications.");
    return ctx.db.insert("exhibitClassifications", {
      userId: user._id,
      caseId: args.caseId,
      name,
      code,
      definition,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

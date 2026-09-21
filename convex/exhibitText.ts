import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthenticatedUser, validateCaseOwnership } from "./lib/auth";
import { normalizeSha256 } from "../shared/exhibits";
async function sourceAccess(
  ctx: QueryCtx | MutationCtx,
  id: Id<"exhibitSources">,
) {
  const user = await getAuthenticatedUser(ctx),
    source = await ctx.db.get(id);
  if (
    !source ||
    source.userId !== user._id ||
    source.kind !== "file" ||
    source.mimeType !== "application/pdf"
  )
    throw new Error("Original PDF source required.");
  await validateCaseOwnership(ctx, source.caseId, user._id);
  const fileId = ctx.db.normalizeId("uploadedFiles", source.originId),
    file = fileId ? await ctx.db.get(fileId) : null;
  if (
    !file ||
    file.clerkUserId !== user.clerkId ||
    file.caseId !== source.caseId ||
    file.deletedAt ||
    file.storageId !== source.storageId ||
    ["deleted", "quarantined", "failed"].includes(file.status)
  )
    throw new Error("Original source unavailable.");
  return { user, source, file };
}
export const page = query({
  args: { sourceId: v.id("exhibitSources"), page: v.number() },
  handler: async (ctx, args) => {
    const { file } = await sourceAccess(ctx, args.sourceId);
    if (!Number.isSafeInteger(args.page) || args.page < 1)
      throw new Error("Invalid page.");
    if (!file.activeMemoryGenerationId) return null;
    const page = await ctx.db
      .query("documentPages")
      .withIndex("by_generation_page", (q) =>
        q
          .eq("memoryGenerationId", file.activeMemoryGenerationId)
          .eq("pageNumber", args.page),
      )
      .first();
    if (
      !page ||
      page.uploadedFileId !== file._id ||
      page.isSynthetic ||
      page.sourceUnitStatus === "failed" ||
      page.sourceUnitStatus === "omitted"
    )
      return null;
    const text = page.canonicalText ?? page.text;
    if (text.length > 100000)
      throw new Error(
        "This extracted page exceeds the selection limit. Use a source region instead.",
      );
    return {
      id: page._id,
      generationId: file.activeMemoryGenerationId,
      page: page.pageNumber,
      text,
      method: page.extractionMethod ?? page.canonicalSource ?? "extracted text",
      warnings: page.warnings,
    };
  },
});
export const pin = mutation({
  args: {
    sourceId: v.id("exhibitSources"),
    pageId: v.id("documentPages"),
    generationId: v.id("documentMemoryGenerations"),
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, source, file } = await sourceAccess(ctx, args.sourceId);
    const page = await ctx.db.get(args.pageId),
      generation = await ctx.db.get(args.generationId);
    if (
      !page ||
      !generation ||
      generation.uploadedFileId !== file._id ||
      generation.clerkUserId !== user.clerkId ||
      !["active", "retired"].includes(generation.status) ||
      !generation.validation.passed ||
      page.uploadedFileId !== file._id ||
      page.memoryGenerationId !== args.generationId ||
      page.isSynthetic ||
      page.sourceUnitStatus === "failed" ||
      page.sourceUnitStatus === "omitted"
    )
      throw new Error("Extraction version is unavailable. Reload the source.");
    const originalHash = normalizeSha256(
      source.sha256 ?? file.storageSha256 ?? file.sha256Hash,
    );
    if (
      generation.sourceFileHash &&
      originalHash &&
      normalizeSha256(generation.sourceFileHash) !== originalHash
    )
      throw new Error(
        "Extraction belongs to a different original file version.",
      );
    const text = page.canonicalText ?? page.text;
    if (
      !Number.isSafeInteger(args.start) ||
      !Number.isSafeInteger(args.end) ||
      args.start < 0 ||
      args.end <= args.start ||
      args.end > text.length ||
      args.end - args.start > 10000
    )
      throw new Error("Select between 1 and 10,000 extracted characters.");
    return ctx.db.insert("exhibitTextAnchors", {
      userId: user._id,
      caseId: source.caseId,
      sourceId: source._id,
      generationId: args.generationId,
      pageId: page._id,
      page: page.pageNumber,
      start: args.start,
      end: args.end,
      text: text.slice(args.start, args.end),
      method: page.extractionMethod ?? page.canonicalSource ?? "extracted text",
      createdAt: Date.now(),
    });
  },
});
export const anchor = query({
  args: { id: v.id("exhibitTextAnchors") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await sourceAccess(ctx, row.sourceId);
    return row;
  },
});

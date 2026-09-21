"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash } from "node:crypto";
export const create = internalAction({
  args: { runId: v.string() },
  handler: async (
    ctx,
    { runId },
  ): Promise<{ caseId: string; fileId: string; subject: string }> => {
    if (
      process.env.EXHIBIT_STUDIO_QA_ENABLED !== "true" ||
      process.env.CONVEX_CLOUD_URL?.includes("blessed-rabbit-457")
    )
      throw new Error("Synthetic QA disabled.");
    if (!/^exhibit-qa-[a-z0-9-]{8,80}$/.test(runId))
      throw new Error("Invalid run ID.");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 32; i++) {
      const page = doc.addPage([612, 792]);
      page.drawText(`SYNTHETIC ORIGINAL PAGE ${i}`, { font, x: 50, y: 700 });
      page.drawText("March 12, 2026 - Synthetic appointment conversation", {
        font,
        size: 12,
        x: 50,
        y: 660,
      });
    }
    const bytes = await doc.save();
    const storageId = await ctx.storage.store(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    );
    try {
      return await ctx.runMutation(internal.exhibitStudioQA.seed, {
        runId,
        storageId,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } catch (e) {
      await ctx.storage.delete(storageId);
      throw e;
    }
  },
});
export const createBrowserFile = internalAction({
  args: { runId: v.string(), subject: v.string() },
  handler: async (ctx, args): Promise<{ fileId: string; caseId: string }> => {
    if (
      process.env.EXHIBIT_STUDIO_QA_ENABLED !== "true" ||
      process.env.CONVEX_CLOUD_URL?.includes("blessed-rabbit-457")
    )
      throw new Error("Synthetic QA disabled.");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc
      .addPage([400, 400])
      .drawText("SYNTHETIC REGION TEST", { font, size: 18, x: 40, y: 300 });
    const bytes = await doc.save();
    const storageId = await ctx.storage.store(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    );
    try {
      return await ctx.runMutation(internal.exhibitStudioQA.seedBrowserFile, {
        ...args,
        storageId,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } catch (e) {
      await ctx.storage.delete(storageId);
      throw e;
    }
  },
});

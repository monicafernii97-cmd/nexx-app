"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildDelivery } from "../src/lib/exhibit-packets/delivery";
import { createHash } from "node:crypto";
export const run = internalAction({
  args: { id: v.id("exhibitDeliveries") },
  handler: async (ctx, { id }): Promise<void> => {
    const attempt = await ctx.runMutation(internal.exhibitDelivery.claim, {
      id,
    });
    if (!attempt) return;
    const stored: Id<"_storage">[] = [];
    const checkpoint = async (stage: string) => {
      if (
        !(await ctx.runMutation(internal.exhibitDelivery.heartbeat, {
          id,
          attempt,
          stage,
        }))
      )
        throw new Error("Delivery cancelled.");
    };
    try {
      const input = await ctx.runQuery(internal.exhibitDelivery.input, { id });
      if (!input) return;
      const p = input.packet;
      const master = await ctx.storage.get(p.storageId!),
        index = await ctx.storage.get(p.indexStorageId!);
      if (!master || !index)
        throw new Error("Finalized packet bytes are unavailable.");
      if (master.size + index.size > 150 * 1024 * 1024)
        throw new Error("DELIVERY_SIZE_LIMIT");
      const result = await buildDelivery({
        master: new Uint8Array(await master.arrayBuffer()),
        index: new Uint8Array(await index.arrayBuffer()),
        sha256: p.sha256!,
        manifestJson: p.manifestJson!,
        report: JSON.parse(p.reportJson!),
        settings: JSON.parse(input.job.settingsJson),
        checkpoint,
      });
      const artifacts = [];
      for (const a of [
        ...result.artifacts,
        {
          filename: "packet-delivery.zip",
          bytes: result.bytes,
          sha256: result.sha256,
        },
        {
          filename: "manifest.json",
          bytes: new TextEncoder().encode(result.manifestJson),
          sha256: "",
        },
      ]) {
        await checkpoint(`Storing ${a.filename}`);
        const mimeType = a.filename.endsWith(".zip")
          ? "application/zip"
          : a.filename.endsWith(".json")
            ? "application/json"
            : "application/pdf";
        const storageId = await ctx.storage.store(
          new Blob([a.bytes as Uint8Array<ArrayBuffer>], { type: mimeType }),
        );
        stored.push(storageId);
        artifacts.push({
          filename: a.filename,
          storageId,
          sha256:
            a.sha256 || createHash("sha256").update(a.bytes).digest("hex"),
          mimeType,
        });
      }
      if (
        !(await ctx.runMutation(internal.exhibitDelivery.finish, {
          id,
          attempt,
          artifacts,
        }))
      )
        await ctx.runMutation(internal.exhibitDelivery.cleanup, {
          id,
          storageIds: stored,
        });
    } catch (e) {
      await ctx.runMutation(internal.exhibitDelivery.cleanup, {
        id,
        storageIds: stored,
      });
      const message = e instanceof Error ? e.message : "Delivery failed.";
      await ctx.runMutation(internal.exhibitDelivery.fail, {
        id,
        attempt,
        message,
        retryable:
          /fetch failed|network|ECONNRESET|ETIMEDOUT|\b50[234]\b/i.test(
            message,
          ),
      });
    }
  },
});

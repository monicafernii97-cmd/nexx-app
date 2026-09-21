"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  composePacket,
  type PacketSource,
} from "../src/lib/exhibit-packets/compose";
import { EXHIBIT_LIMITS, parseItems, parseSettings } from "../shared/exhibits";

export const generate = internalAction({
  args: { id: v.id("exhibitCandidates") },
  handler: async (ctx, { id }) => {
    const startedAt = Date.now();
    const attempt = await ctx.runMutation(internal.exhibitStudio.claim, { id });
    if (!attempt) return;
    const checkpoint = async (stage: string) => {
      if (
        !(await ctx.runMutation(internal.exhibitStudio.heartbeat, {
          id,
          attempt,
          stage,
        }))
      )
        throw new Error("GENERATION_CANCELLED");
    };
    let stored: import("./_generated/dataModel").Id<"_storage"> | undefined;
    let indexStored:
      | import("./_generated/dataModel").Id<"_storage">
      | undefined;
    try {
      const input = await ctx.runQuery(internal.exhibitStudio.workerInput, {
        id,
      });
      if (!input) return;
      const sources: PacketSource[] = [];
      let totalBytes = 0;
      for (const source of input.sources) {
        await checkpoint(
          `Resolving source ${sources.length + 1} of ${input.sources.length}`,
        );
        const blob = source.storageId
          ? await ctx.storage.get(source.storageId)
          : null;
        if (source.kind === "file" && !blob)
          throw new Error(
            "SOURCE_UNAVAILABLE: Original bytes are unavailable.",
          );
        if (blob) {
          totalBytes += blob.size;
          if (
            blob.size > EXHIBIT_LIMITS.sourceBytes ||
            totalBytes > EXHIBIT_LIMITS.totalBytes
          )
            throw new Error(
              "SOURCE_SIZE_LIMIT: Originals exceed the supported packet size.",
            );
        }
        sources.push({
          id: source._id,
          title: source.title,
          kind: source.kind,
          mimeType: source.mimeType,
          snapshot: source.snapshot,
          sha256: source.sha256,
          bytes: blob ? new Uint8Array(await blob.arrayBuffer()) : undefined,
        });
      }
      const result = await composePacket({
        title: input.job.title,
        items: parseItems(JSON.parse(input.job.itemsJson)),
        settings: parseSettings(JSON.parse(input.job.settingsJson)),
        sources,
        textAnchors: input.anchors.map((a) => ({
          id: a._id,
          sourceId: a.sourceId,
          generationId: a.generationId,
          page: a.page,
          start: a.start,
          end: a.end,
          text: a.text,
          method: a.method,
        })),
        checkpoint,
        context: {
          caseId: input.job.caseId,
          collectionId: input.job.collectionId,
          revision: input.job.revision,
        },
      });
      await checkpoint("Storing validated candidate");
      stored = await ctx.storage.store(
        new Blob([result.bytes as Uint8Array<ArrayBuffer>], {
          type: "application/pdf",
        }),
      );
      indexStored = await ctx.storage.store(
        new Blob([result.indexBytes as Uint8Array<ArrayBuffer>], {
          type: "application/pdf",
        }),
      );
      const accepted = await ctx.runMutation(internal.exhibitStudio.finish, {
        id,
        attempt,
        storageId: stored,
        sha256: result.sha256,
        manifestHash: result.manifestHash,
        manifestJson: result.manifestJson,
        indexStorageId: indexStored,
        indexSha256: result.indexSha256,
        reportJson: JSON.stringify(result.report),
      });
      if (!accepted)
        await ctx.runMutation(internal.exhibitStudio.cleanupOutput, {
          id,
          storageId: stored,
          indexStorageId: indexStored,
        });
      console.info("exhibit_packet_job", {
        id,
        attempt,
        status: accepted ? "ready" : "cancelled",
        durationMs: Date.now() - startedAt,
        pageCount: result.report.pageCount,
        exhibitCount: result.report.exhibitCount,
      });
    } catch (error) {
      // A timed-out publication call may already have committed. Cleanup must
      // check the database pointer, never delete a potentially published PDF.
      if (stored || indexStored)
        await ctx.runMutation(internal.exhibitStudio.cleanupOutput, {
          id,
          storageId: stored,
          indexStorageId: indexStored,
        });
      const message =
        error instanceof Error ? error.message : "Packet generation failed.";
      const retryable =
        /fetch failed|network|ECONNRESET|ETIMEDOUT|temporarily unavailable|\b50[234]\b/i.test(
          message,
        );
      console.warn("exhibit_packet_job", {
        id,
        attempt,
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: message.match(/^[A-Z_]+:/)?.[0] ?? "GENERATION_FAILED",
        retryable,
      });
      await ctx.runMutation(internal.exhibitStudio.fail, {
        id,
        attempt,
        message,
        retryable,
      });
    }
  },
});

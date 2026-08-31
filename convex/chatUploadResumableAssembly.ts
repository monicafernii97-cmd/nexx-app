"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type AssemblyClaim =
  | { alreadyCompleted: true; storageId: Id<"_storage"> }
  | {
      alreadyCompleted: false;
      leaseId: string;
      expectedByteSize: number;
      expectedMimeType: string;
      clientSha256: string;
      chunks: Array<{
        chunkIndex: number;
        storageId: Id<"_storage">;
        byteSize: number;
      }>;
    };

export const assemble = internalAction({
  args: {
    uploadSessionId: v.id("chatUploadSessions"),
    resumableUploadId: v.id("chatUploadResumableUploads"),
    tokenHash: v.string(),
    leaseId: v.string(),
  },
  handler: async (ctx, args): Promise<{ storageId: Id<"_storage"> }> => {
    let assembledStorageId: Id<"_storage"> | undefined;
    let claimedLeaseId: string | undefined;
    try {
      const claim = (await ctx.runMutation(
        internal.chatUploads.claimResumableAssembly,
        args,
      )) as AssemblyClaim;
      if (claim.alreadyCompleted) return { storageId: claim.storageId };
      claimedLeaseId = claim.leaseId;

      const parts: Buffer[] = [];
      let actualByteSize = 0;
      for (const chunk of claim.chunks) {
        const blob = await ctx.storage.get(chunk.storageId);
        if (!blob || blob.size !== chunk.byteSize)
          throw new Error("Stored resumable chunk is unavailable.");
        const bytes = Buffer.from(await blob.arrayBuffer());
        parts.push(bytes);
        actualByteSize += bytes.byteLength;
      }
      if (actualByteSize !== claim.expectedByteSize)
        throw new Error("Assembled upload size did not match.");

      const assembledBytes = Buffer.concat(parts, actualByteSize);
      const assembledSha256 = createHash("sha256")
        .update(assembledBytes)
        .digest("hex");
      if (assembledSha256 !== claim.clientSha256)
        throw new Error("Assembled upload integrity did not match.");

      assembledStorageId = await ctx.storage.store(
        new Blob([new Uint8Array(assembledBytes)], {
          type: claim.expectedMimeType,
        }),
      );
      const storedMetadata = await ctx.storage.getMetadata(assembledStorageId);
      if (
        !storedMetadata ||
        storedMetadata.size !== claim.expectedByteSize ||
        storedMetadata.sha256 !== assembledSha256
      )
        throw new Error("Stored resumable upload integrity did not match.");

      await ctx.runMutation(internal.chatUploads.completeResumableAssembly, {
        resumableUploadId: args.resumableUploadId,
        leaseId: claim.leaseId,
        storageId: assembledStorageId,
        verifiedSha256: assembledSha256,
      });
      return { storageId: assembledStorageId };
    } catch (error) {
      if (assembledStorageId) {
        try {
          await ctx.storage.delete(assembledStorageId);
        } catch {
          /* cleanup maintenance remains authoritative */
        }
      }
      if (claimedLeaseId) {
        try {
          await ctx.runMutation(internal.chatUploads.releaseResumableAssembly, {
            resumableUploadId: args.resumableUploadId,
            leaseId: claimedLeaseId,
            failureCode:
              error instanceof Error
                ? error.message
                : "resumable_assembly_failed",
          });
        } catch {
          // The lease expires automatically; cleanup is still authoritative.
        }
      }
      throw error;
    }
  },
});

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import {
  deleteOpenAIFile,
  deleteVectorStore,
} from "../src/lib/nexx/fileSearch";
import { hasCompleteDocumentRetrieval } from "./lib/chatUploadReadiness";

const laneValidator = v.union(
  v.literal("pr"),
  v.literal("release"),
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("resilience"),
);

const environmentValidator = v.union(
  v.literal("local"),
  v.literal("preview"),
  v.literal("staging"),
  v.literal("production"),
);

const RUN_ID_RE = /^e2e-(pr|release|daily|weekly|resilience)-[a-z0-9-]{8,72}$/;

function validateRunId(runId: string) {
  if (!RUN_ID_RE.test(runId))
    throw new Error("Invalid synthetic upload run id");
}

function filenamePrefix(runId: string) {
  return `nexx-e2e-${runId}--`;
}

async function authenticatedSubject(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");
  return identity.subject;
}

export const registerRun = mutation({
  args: {
    runId: v.string(),
    lane: laneValidator,
    environment: environmentValidator,
    deploymentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await authenticatedSubject(ctx);
    validateRunId(args.runId);
    const existing = await ctx.db
      .query("chatUploadE2ERuns")
      .withIndex("by_user_run", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("runId", args.runId),
      )
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("chatUploadE2ERuns", {
      clerkUserId,
      runId: args.runId,
      lane: args.lane,
      environment: args.environment,
      deploymentId: args.deploymentId?.slice(0, 128),
      filenamePrefix: filenamePrefix(args.runId),
      status: "registered",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getRunStatus = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const clerkUserId = await authenticatedSubject(ctx);
    validateRunId(args.runId);
    const run = await ctx.db
      .query("chatUploadE2ERuns")
      .withIndex("by_user_run", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("runId", args.runId),
      )
      .unique();
    if (!run) return null;
    return {
      status: run.status,
      cleanupCompletedAt: run.cleanupCompletedAt,
      cleanupErrorSafe: run.cleanupErrorSafe,
      cleanupDeletedCounts: run.cleanupDeletedCounts,
    };
  },
});

export const inspectRunUpload = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const clerkUserId = await authenticatedSubject(ctx);
    validateRunId(args.runId);
    const run = await ctx.db
      .query("chatUploadE2ERuns")
      .withIndex("by_user_run", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("runId", args.runId),
      )
      .unique();
    if (!run) throw new Error("Synthetic upload run not found");

    const sessions = (
      await ctx.db
        .query("chatUploadSessions")
        .withIndex("by_user_created", (q) =>
          q
            .eq("clerkUserId", clerkUserId)
            .gte("createdAt", run.createdAt - 60_000),
        )
        .collect()
    ).filter((session) => session.filename.startsWith(run.filenamePrefix));
    const uploadedFileIds = sessions.flatMap((session) =>
      session.uploadedFileId ? [String(session.uploadedFileId)] : [],
    );
    const uploadedFiles = (
      await Promise.all(
        sessions.map((session) =>
          session.uploadedFileId ? ctx.db.get(session.uploadedFileId) : null,
        ),
      )
    ).filter((file): file is NonNullable<typeof file> => Boolean(file));
    const attemptRows = (
      await Promise.all(
        sessions.map((session) =>
          ctx.db
            .query("chatUploadAttempts")
            .withIndex("by_session", (q) =>
              q.eq("uploadSessionId", session._id),
            )
            .collect(),
        ),
      )
    ).flat();

    return {
      sessionCount: sessions.length,
      uploadedFileIds,
      statuses: sessions.map((session) => session.status),
      files: uploadedFiles.map((file) => ({
        status: file.status,
        contextTruncated: file.contextTruncated ?? false,
        coverageStatus: file.coverageStatus,
        fullDocumentReviewStatus: file.fullDocumentReviewStatus,
        safeForChat:
          (file.status === "ready" || file.status === "partial") &&
          (!file.contextTruncated ||
            hasCompleteDocumentRetrieval({
              openaiFileId: file.openaiFileId,
              openaiTextFileId: file.openaiTextFileId,
              activeMemoryGenerationId: file.activeMemoryGenerationId
                ? String(file.activeMemoryGenerationId)
                : undefined,
            })),
      })),
      transports: attemptRows
        .map((attempt) => attempt.transport)
        .filter(Boolean),
      attemptCount: attemptRows.length,
    };
  },
});

export const beginCleanup = internalMutation({
  args: { clerkUserId: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    validateRunId(args.runId);
    const run = await ctx.db
      .query("chatUploadE2ERuns")
      .withIndex("by_user_run", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("runId", args.runId),
      )
      .unique();
    if (!run) throw new Error("Synthetic upload run not found");
    if (run.status === "cleaned")
      return { alreadyCleaned: true, runId: run._id };
    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: "cleaning",
      cleanupRequestedAt: run.cleanupRequestedAt ?? now,
      cleanupErrorSafe: undefined,
      updatedAt: now,
    });
    return { alreadyCleaned: false, runId: run._id };
  },
});

export const getCleanupSnapshot = internalQuery({
  args: { runId: v.id("chatUploadE2ERuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Synthetic upload run not found");
    const sessions = (
      await ctx.db
        .query("chatUploadSessions")
        .withIndex("by_user_created", (q) =>
          q
            .eq("clerkUserId", run.clerkUserId)
            .gte("createdAt", run.createdAt - 60_000),
        )
        .collect()
    ).filter((session) => session.filename.startsWith(run.filenamePrefix));
    const uploadedFiles = (
      await Promise.all(
        sessions.map(async (session) =>
          session.uploadedFileId
            ? await ctx.db.get(session.uploadedFileId)
            : null,
        ),
      )
    ).filter((file): file is NonNullable<typeof file> => Boolean(file));
    return {
      clerkUserId: run.clerkUserId,
      uploadedFileIds: uploadedFiles.map((file) => file._id),
      vectorStoreIds: [
        ...new Set(
          uploadedFiles.flatMap((file) =>
            file.vectorStoreId ? [file.vectorStoreId] : [],
          ),
        ),
      ],
      openaiFileIds: [
        ...new Set(
          uploadedFiles.flatMap((file) =>
            [file.openaiFileId, file.openaiTextFileId].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ),
      ],
    };
  },
});

async function deleteAll<TableName extends TableNames>(
  ctx: Pick<MutationCtx, "db">,
  rows: Array<{ _id: Id<TableName> }>,
) {
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

export const deleteRunData = internalMutation({
  args: { runId: v.id("chatUploadE2ERuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { run: 0 };
    const sessions = (
      await ctx.db
        .query("chatUploadSessions")
        .withIndex("by_user_created", (q) =>
          q
            .eq("clerkUserId", run.clerkUserId)
            .gte("createdAt", run.createdAt - 60_000),
        )
        .collect()
    ).filter((session) => session.filename.startsWith(run.filenamePrefix));
    const counts: Record<string, number> = {};

    for (const session of sessions) {
      const file = session.uploadedFileId
        ? await ctx.db.get(session.uploadedFileId)
        : null;
      const conversationId = session.conversationId ?? file?.conversationId;

      if (conversationId) {
        counts.messageAttachments =
          (counts.messageAttachments ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("messageAttachments")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.documentRetrievalAudit =
          (counts.documentRetrievalAudit ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentRetrievalAudit")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.documentAnswerEvidence =
          (counts.documentAnswerEvidence ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentAnswerEvidence")
              .withIndex("by_conversation_created", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.chatAnswerSources =
          (counts.chatAnswerSources ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("chatAnswerSources")
              .withIndex("by_conversation_created", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.retrievalRuns =
          (counts.retrievalRuns ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("retrievalRuns")
              .withIndex("by_conversation_created", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.conversationDocumentState =
          (counts.conversationDocumentState ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("conversationDocumentState")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.conversationLegalIssueState =
          (counts.conversationLegalIssueState ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("conversationLegalIssueState")
              .withIndex("by_conversation_status", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.conversationSummaries =
          (counts.conversationSummaries ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("conversationSummaries")
              .withIndex("by_conversationId", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.debugTraces =
          (counts.debugTraces ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("debugTraces")
              .withIndex("by_conversationId", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.chatCorrections =
          (counts.chatCorrections ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("chatCorrections")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        const jobs = await ctx.db
          .query("chatGenerationJobs")
          .withIndex("by_request", (q) =>
            q.eq("conversationId", conversationId),
          )
          .collect();
        counts.chatGenerationJobs =
          (counts.chatGenerationJobs ?? 0) + (await deleteAll(ctx, jobs));
        counts.messages =
          (counts.messages ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("messages")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        counts.chatTurns =
          (counts.chatTurns ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("chatTurns")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversationId),
              )
              .collect(),
          ));
        const conversation = await ctx.db.get(conversationId);
        if (conversation) {
          await ctx.db.delete(conversationId);
          counts.conversations = (counts.conversations ?? 0) + 1;
        }
      }

      if (file) {
        const fileId = file._id;
        counts.auditEvents =
          (counts.auditEvents ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("auditEvents")
              .withIndex("by_file_created", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.providerUsageEvents =
          (counts.providerUsageEvents ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("providerUsageEvents")
              .withIndex("by_file_created", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.reviewFlags =
          (counts.reviewFlags ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("reviewFlags")
              .withIndex("by_file_created", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentReprocessJobs =
          (counts.documentReprocessJobs ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentReprocessJobs")
              .withIndex("by_uploaded_file", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        const understandingRuns = await ctx.db
          .query("documentUnderstandingRuns")
          .withIndex("by_file_created", (q) => q.eq("uploadedFileId", fileId))
          .collect();
        for (const understandingRun of understandingRuns) {
          counts.documentUnderstandingNodes =
            (counts.documentUnderstandingNodes ?? 0) +
            (await deleteAll(
              ctx,
              await ctx.db
                .query("documentUnderstandingNodes")
                .withIndex("by_run_level_node", (q) =>
                  q.eq("runId", understandingRun._id),
                )
                .collect(),
            ));
        }
        counts.documentUnderstandingRecords =
          (counts.documentUnderstandingRecords ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentUnderstandingRecords")
              .withIndex("by_file_created", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentUnderstandingRuns =
          (counts.documentUnderstandingRuns ?? 0) +
          (await deleteAll(ctx, understandingRuns));
        counts.documentExtractionAttempts =
          (counts.documentExtractionAttempts ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentExtractionAttempts")
              .withIndex("by_file_created", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.fileAccessGrants =
          (counts.fileAccessGrants ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("fileAccessGrants")
              .withIndex("by_file", (q) => q.eq("uploadedFileId", fileId))
              .collect(),
          ));
        counts.documentSourceUnitCoverage =
          (counts.documentSourceUnitCoverage ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentSourceUnitCoverage")
              .withIndex("by_file_unit", (q) => q.eq("uploadedFileId", fileId))
              .collect(),
          ));
        counts.documentTables =
          (counts.documentTables ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentTables")
              .withIndex("by_file_generation", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentBlocks =
          (counts.documentBlocks ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentBlocks")
              .withIndex("by_file_generation", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentPages =
          (counts.documentPages ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentPages")
              .withIndex("by_uploaded_file_page", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentChunks =
          (counts.documentChunks ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentChunks")
              .withIndex("by_uploaded_file_chunk", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentLegalMetadata =
          (counts.documentLegalMetadata ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentLegalMetadata")
              .withIndex("by_uploaded_file", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentAliases =
          (counts.documentAliases ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentAliases")
              .withIndex("by_uploaded_file", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentCoverageManifests =
          (counts.documentCoverageManifests ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentCoverageManifests")
              .withIndex("by_file_created", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        counts.documentMemoryGenerations =
          (counts.documentMemoryGenerations ?? 0) +
          (await deleteAll(
            ctx,
            await ctx.db
              .query("documentMemoryGenerations")
              .withIndex("by_file_generation", (q) =>
                q.eq("uploadedFileId", fileId),
              )
              .collect(),
          ));
        if (file.fullTextStorageId)
          await ctx.storage.delete(file.fullTextStorageId);
        if (file.storageId && file.storageId !== session.storageId)
          await ctx.storage.delete(file.storageId);
        await ctx.db.delete(fileId);
        counts.uploadedFiles = (counts.uploadedFiles ?? 0) + 1;
      }

      const chunks = await ctx.db
        .query("chatUploadResumableChunks")
        .withIndex("by_session", (q) => q.eq("uploadSessionId", session._id))
        .collect();
      for (const chunk of chunks)
        if (chunk.storageId) await ctx.storage.delete(chunk.storageId);
      counts.chatUploadResumableChunks =
        (counts.chatUploadResumableChunks ?? 0) +
        (await deleteAll(ctx, chunks));
      counts.chatUploadResumableUploads =
        (counts.chatUploadResumableUploads ?? 0) +
        (await deleteAll(
          ctx,
          await ctx.db
            .query("chatUploadResumableUploads")
            .withIndex("by_session", (q) =>
              q.eq("uploadSessionId", session._id),
            )
            .collect(),
        ));
      counts.chatUploadFallbackTickets =
        (counts.chatUploadFallbackTickets ?? 0) +
        (await deleteAll(
          ctx,
          await ctx.db
            .query("chatUploadFallbackTickets")
            .withIndex("by_session", (q) =>
              q.eq("uploadSessionId", session._id),
            )
            .collect(),
        ));
      counts.chatUploadAttempts =
        (counts.chatUploadAttempts ?? 0) +
        (await deleteAll(
          ctx,
          await ctx.db
            .query("chatUploadAttempts")
            .withIndex("by_session", (q) =>
              q.eq("uploadSessionId", session._id),
            )
            .collect(),
        ));
      if (session.storageId) await ctx.storage.delete(session.storageId);
      await ctx.db.delete(session._id);
      counts.chatUploadSessions = (counts.chatUploadSessions ?? 0) + 1;
    }

    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: "cleaned",
      cleanupDeletedCounts: counts,
      cleanupCompletedAt: now,
      updatedAt: now,
    });
    return counts;
  },
});

export const markCleanupFailed = internalMutation({
  args: { runId: v.id("chatUploadE2ERuns"), error: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    await ctx.db.patch(run._id, {
      status: "cleanup_failed",
      cleanupErrorSafe: args.error.slice(0, 240),
      updatedAt: Date.now(),
    });
  },
});

export const requestCleanup = action({
  args: { runId: v.string() },
  handler: async (ctx, args): Promise<{ status: "cleaned" }> => {
    const clerkUserId = await authenticatedSubject(ctx);
    validateRunId(args.runId);
    const start = await ctx.runMutation(internal.chatUploadE2E.beginCleanup, {
      clerkUserId,
      runId: args.runId,
    });
    if (start.alreadyCleaned) return { status: "cleaned" };
    try {
      const snapshot = await ctx.runQuery(
        internal.chatUploadE2E.getCleanupSnapshot,
        { runId: start.runId },
      );
      for (const vectorStoreId of snapshot.vectorStoreIds)
        await deleteVectorStore(vectorStoreId);
      for (const fileId of snapshot.openaiFileIds)
        await deleteOpenAIFile(fileId);
      await ctx.runMutation(internal.chatUploadE2E.deleteRunData, {
        runId: start.runId,
      });
      return { status: "cleaned" };
    } catch (error) {
      await ctx.runMutation(internal.chatUploadE2E.markCleanupFailed, {
        runId: start.runId,
        error:
          error instanceof Error ? error.message : "Synthetic cleanup failed",
      });
      throw new Error("Synthetic upload cleanup failed");
    }
  },
});

/** Recovery sweep for CI cancellation or browser crashes. */
export const cleanupAbandonedRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const retentionCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const oldLedgers = await ctx.db
      .query("chatUploadE2ERuns")
      .withIndex("by_created", (q) => q.lt("createdAt", retentionCutoff))
      .take(100);
    for (const run of oldLedgers) {
      if (run.status === "cleaned") await ctx.db.delete(run._id);
    }

    const cutoff = now - 2 * 60 * 60 * 1000;
    const stale = (
      await ctx.db
        .query("chatUploadE2ERuns")
        .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
        .take(20)
    ).filter((run) => run.status !== "cleaned");
    for (const run of stale) {
      await ctx.scheduler.runAfter(
        0,
        internal.chatUploadE2E.cleanupAbandonedRun,
        { runId: run._id },
      );
    }
    return stale.length;
  },
});

export const cleanupAbandonedRun = internalAction({
  args: { runId: v.id("chatUploadE2ERuns") },
  handler: async (ctx, args): Promise<void> => {
    const snapshot = await ctx.runQuery(
      internal.chatUploadE2E.getCleanupSnapshot,
      { runId: args.runId },
    );
    for (const vectorStoreId of snapshot.vectorStoreIds)
      await deleteVectorStore(vectorStoreId);
    for (const fileId of snapshot.openaiFileIds) await deleteOpenAIFile(fileId);
    await ctx.runMutation(internal.chatUploadE2E.deleteRunData, {
      runId: args.runId,
    });
  },
});

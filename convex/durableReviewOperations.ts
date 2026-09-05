import { v } from 'convex/values';
import { makeFunctionReference, type FunctionReference } from 'convex/server';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { stableCapabilityHash } from '../src/lib/nexx/capabilities/documentCapabilityLedger';
import {
  DURABLE_REVIEW_MAP_BATCH_SIZE,
  DURABLE_REVIEW_MODEL,
  DURABLE_REVIEW_REDUCE_BATCH_SIZE,
  DURABLE_REVIEW_OPERATION_MAX_RESUMES,
  DURABLE_REVIEW_RESUME_CONFIRMATION,
  DURABLE_REVIEW_RESTART_CONFIRMATION,
  DURABLE_REVIEW_VERSION,
  validateDurableReviewRestartApproval,
} from '../src/lib/nexx/durableReviewRuntime';
import { verifyCompleteSourceCoverage } from '../src/lib/nexx/sourceCoverageVerification';

const PROCESS_RUN_REFERENCE = makeFunctionReference<'action', { runId: Id<'documentUnderstandingRuns'> }, unknown>(
  'documentUnderstanding:processRun',
) as unknown as FunctionReference<'action', 'internal', { runId: Id<'documentUnderstandingRuns'> }, unknown>;

function requireOperationsSecret(secret: string) {
  const expected = process.env.VERIFICATION_SECRET;
  if (!expected || secret !== expected) throw new Error('durable_review_operations_not_authorized');
}

async function loadVerifiedCoverage(ctx: MutationCtx, args: {
  uploadedFileId: Id<'uploadedFiles'>;
  memoryGenerationId: Id<'documentMemoryGenerations'>;
  coverageManifestId: Id<'documentCoverageManifests'>;
  expectedUnits: number;
}) {
  const manifest = await ctx.db.get(args.coverageManifestId);
  if (!manifest || manifest.uploadedFileId !== args.uploadedFileId || manifest.memoryGenerationId !== args.memoryGenerationId) {
    throw new Error('durable_review_coverage_identity_mismatch');
  }
  const units = await ctx.db.query('documentSourceUnitCoverage')
    .withIndex('by_manifest_unit', (q) => q.eq('manifestId', manifest._id))
    .collect();
  const verification = verifyCompleteSourceCoverage({ manifest, units });
  if (!verification.passed || verification.unitsExpected !== args.expectedUnits || verification.unitsRead !== args.expectedUnits) {
    throw new Error(`durable_review_coverage_not_verified:${verification.errors.join(',') || 'expected_unit_mismatch'}`);
  }
  return { manifest, units, verification };
}

export const inspect = mutation({
  args: {
    secret: v.string(),
    operationId: v.string(),
    sourceRunId: v.id('documentUnderstandingRuns'),
    uploadedFileId: v.id('uploadedFiles'),
    expectedUnits: v.number(),
    operatorId: v.string(),
  },
  handler: async (ctx, args) => {
    requireOperationsSecret(args.secret);
    if (!args.operationId.trim() || !args.operatorId.trim() || !Number.isInteger(args.expectedUnits) || args.expectedUnits < 1) {
      throw new Error('durable_review_inspection_inputs_invalid');
    }
    const existing = await ctx.db.query('durableReviewRepairOperations')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
    if (existing) {
      if (
        existing.sourceRunId !== args.sourceRunId ||
        existing.uploadedFileId !== args.uploadedFileId ||
        existing.expectedUnits !== args.expectedUnits ||
        existing.operatorId !== args.operatorId
      ) throw new Error('durable_review_operation_id_conflict');
      return existing;
    }

    const [sourceRun, file] = await Promise.all([
      ctx.db.get(args.sourceRunId),
      ctx.db.get(args.uploadedFileId),
    ]);
    if (!sourceRun || !file || sourceRun.uploadedFileId !== file._id) throw new Error('durable_review_source_identity_mismatch');
    if (sourceRun.status !== 'failed' && sourceRun.status !== 'dead_letter') throw new Error('durable_review_source_not_failed');
    if (file.status === 'quarantined' || file.status === 'deleted' || file.deletedAt) throw new Error('durable_review_document_ineligible');
    if (!file.activeMemoryGenerationId || file.activeMemoryGenerationId !== sourceRun.memoryGenerationId) {
      throw new Error('durable_review_source_not_active_generation');
    }
    if (file.activeUnderstandingRunId !== sourceRun._id) throw new Error('durable_review_source_not_active_run');
    const generation = await ctx.db.get(file.activeMemoryGenerationId);
    if (!generation?.coverageManifestId || generation.coverageManifestId !== sourceRun.coverageManifestId) {
      throw new Error('durable_review_generation_manifest_mismatch');
    }
    const coverage = await loadVerifiedCoverage(ctx, {
      uploadedFileId: file._id,
      memoryGenerationId: generation._id,
      coverageManifestId: generation.coverageManifestId,
      expectedUnits: args.expectedUnits,
    });
    const chunks = await ctx.db.query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', generation._id))
      .collect();
    if (chunks.length === 0) throw new Error('durable_review_canonical_chunks_missing');
    const indexes = chunks.map((chunk) => chunk.chunkIndex).sort((a, b) => a - b);
    if (indexes.some((index, position) => index !== position)) throw new Error('durable_review_chunk_indexes_not_contiguous');

    const now = Date.now();
    const operationRowId = await ctx.db.insert('durableReviewRepairOperations', {
      operationId: args.operationId,
      sourceRunId: sourceRun._id,
      uploadedFileId: file._id,
      memoryGenerationId: generation._id,
      coverageManifestId: coverage.manifest._id,
      expectedUnits: args.expectedUnits,
      verifiedUnits: coverage.verification.unitsRead,
      totalChunks: chunks.length,
      sourceRunStatus: sourceRun.status,
      replacementVersion: DURABLE_REVIEW_VERSION,
      status: 'awaiting_approval',
      operatorId: args.operatorId,
      beforeJson: JSON.stringify({
        sourceRunId: sourceRun._id,
        sourceRunStatus: sourceRun.status,
        sourceRunVersion: sourceRun.version,
        activeUnderstandingRunId: file.activeUnderstandingRunId,
        activeUnderstandingRecordId: file.activeUnderstandingRecordId ?? null,
        fullDocumentReviewStatus: file.fullDocumentReviewStatus,
        memoryGenerationId: generation._id,
        coverageManifestId: coverage.manifest._id,
        expectedUnits: coverage.verification.unitsExpected,
        verifiedUnits: coverage.verification.unitsRead,
        totalChunks: chunks.length,
      }),
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(operationRowId);
  },
});

export const authorize = mutation({
  args: {
    secret: v.string(),
    operationId: v.string(),
    approverId: v.string(),
    approvalId: v.string(),
    approvalReason: v.string(),
  },
  handler: async (ctx, args) => {
    requireOperationsSecret(args.secret);
    const operation = await ctx.db.query('durableReviewRepairOperations')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
    if (!operation) throw new Error('durable_review_operation_missing');
    validateDurableReviewRestartApproval({
      operatorId: operation.operatorId,
      approverId: args.approverId,
      approvalId: args.approvalId,
      approvalReason: args.approvalReason,
    });
    if (operation.status !== 'awaiting_approval' && operation.status !== 'authorized') {
      throw new Error(`durable_review_operation_not_approvable:${operation.status}`);
    }
    if (operation.status === 'authorized' && (
      operation.approverId !== args.approverId || operation.approvalId !== args.approvalId ||
      operation.approvalReason !== args.approvalReason
    )) throw new Error('durable_review_authorization_conflict');
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: 'authorized',
      approverId: args.approverId,
      approvalId: args.approvalId,
      approvalReason: args.approvalReason,
      approvedAt: operation.approvedAt ?? now,
      updatedAt: now,
    });
    return await ctx.db.get(operation._id);
  },
});

export const apply = mutation({
  args: {
    secret: v.string(),
    operationId: v.string(),
    operatorId: v.string(),
    confirmation: v.literal(DURABLE_REVIEW_RESTART_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    requireOperationsSecret(args.secret);
    const operation = await ctx.db.query('durableReviewRepairOperations')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
    if (!operation) throw new Error('durable_review_operation_missing');
    if (operation.operatorId !== args.operatorId) throw new Error('durable_review_operator_mismatch');
    if (operation.replacementRunId && (operation.status === 'applied' || operation.status === 'verified')) {
      return operation;
    }
    if (operation.status !== 'authorized' || !operation.approverId || !operation.approvalId) {
      throw new Error('durable_review_operation_not_authorized');
    }
    const [sourceRun, file] = await Promise.all([
      ctx.db.get(operation.sourceRunId),
      ctx.db.get(operation.uploadedFileId),
    ]);
    if (!sourceRun || !file || file.activeUnderstandingRunId !== sourceRun._id || file.activeMemoryGenerationId !== operation.memoryGenerationId) {
      throw new Error('durable_review_state_changed_after_approval');
    }
    if (sourceRun.status !== operation.sourceRunStatus) throw new Error('durable_review_source_status_changed_after_approval');
    await loadVerifiedCoverage(ctx, {
      uploadedFileId: file._id,
      memoryGenerationId: operation.memoryGenerationId,
      coverageManifestId: operation.coverageManifestId,
      expectedUnits: operation.expectedUnits,
    });
    const chunks = await ctx.db.query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', operation.memoryGenerationId))
      .collect();
    if (chunks.length !== operation.totalChunks) throw new Error('durable_review_chunk_count_changed_after_approval');
    const now = Date.now();
    const stableJobId = `dur_${stableCapabilityHash({
      operationId: operation.operationId,
      sourceRunId: sourceRun._id,
      uploadedFileId: file._id,
      memoryGenerationId: operation.memoryGenerationId,
      coverageManifestId: operation.coverageManifestId,
      version: DURABLE_REVIEW_VERSION,
    }).slice(0, 28)}`;
    const replacementRunId = await ctx.db.insert('documentUnderstandingRuns', {
      uploadedFileId: file._id,
      dataProvenance: file.dataProvenance ?? 'production',
      qaRunId: file.qaRunId,
      memoryGenerationId: operation.memoryGenerationId,
      coverageManifestId: operation.coverageManifestId,
      clerkUserId: file.clerkUserId,
      status: 'queued',
      version: DURABLE_REVIEW_VERSION,
      model: DURABLE_REVIEW_MODEL,
      stableJobId,
      totalChunks: chunks.length,
      nextChunkIndex: 0,
      currentLevel: 0,
      nextNodeIndex: 0,
      mapBatchSize: DURABLE_REVIEW_MAP_BATCH_SIZE,
      reduceBatchSize: DURABLE_REVIEW_REDUCE_BATCH_SIZE,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(file._id, {
      activeUnderstandingRunId: replacementRunId,
      activeUnderstandingRecordId: undefined,
      fullDocumentReviewStatus: 'building',
      updatedAt: now,
    });
    await ctx.db.patch(operation._id, {
      replacementRunId,
      status: 'applied',
      appliedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: replacementRunId });
    return await ctx.db.get(operation._id);
  },
});

/** Resume the same approved replacement while preserving every verified node. */
export const resume = mutation({
  args: {
    secret: v.string(),
    operationId: v.string(),
    operatorId: v.string(),
    confirmation: v.literal(DURABLE_REVIEW_RESUME_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    requireOperationsSecret(args.secret);
    const operation = await ctx.db.query('durableReviewRepairOperations')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
    if (!operation?.replacementRunId) throw new Error('durable_review_replacement_missing');
    if (operation.operatorId !== args.operatorId) throw new Error('durable_review_operator_mismatch');
    if (operation.status !== 'applied' || !operation.approverId || !operation.approvalId) {
      throw new Error(`durable_review_operation_not_resumable:${operation.status}`);
    }
    const [run, file] = await Promise.all([
      ctx.db.get(operation.replacementRunId),
      ctx.db.get(operation.uploadedFileId),
    ]);
    if (!run || !file || !['dead_letter', 'failed', 'partial'].includes(run.status)) {
      return { resumed: false as const, status: run?.status ?? 'missing', reason: 'replacement_not_failed' };
    }
    if (
      run.version !== DURABLE_REVIEW_VERSION ||
      run.uploadedFileId !== operation.uploadedFileId ||
      run.memoryGenerationId !== operation.memoryGenerationId ||
      file.activeUnderstandingRunId !== run._id ||
      file.activeMemoryGenerationId !== operation.memoryGenerationId ||
      file.status === 'quarantined' || file.status === 'deleted' || file.deletedAt
    ) throw new Error('durable_review_resume_scope_changed');
    await loadVerifiedCoverage(ctx, {
      uploadedFileId: operation.uploadedFileId,
      memoryGenerationId: operation.memoryGenerationId,
      coverageManifestId: operation.coverageManifestId,
      expectedUnits: operation.expectedUnits,
    });
    const operationResumeCount = operation.resumeCount ?? 0;
    if (operationResumeCount >= DURABLE_REVIEW_OPERATION_MAX_RESUMES) {
      throw new Error('durable_review_operation_resume_budget_exhausted');
    }
    const now = Date.now();
    if (run.deadLetterNodeId) {
      const node = await ctx.db.query('documentUnderstandingWorkNodes')
        .withIndex('by_node_id', (q) => q.eq('nodeId', run.deadLetterNodeId!))
        .first();
      if (!node || node.runId !== run._id) throw new Error('durable_review_dead_letter_node_missing');
      await ctx.db.patch(node._id, {
        status: 'retryable_failed',
        cycleAttemptCount: 0,
        strictRetry: false,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        validationState: 'pending',
        validationErrors: [],
        failureClass: undefined,
        lastErrorMessage: undefined,
        finishedAt: undefined,
        updatedAt: now,
      });
    }
    const resumedStatus = run.nextChunkIndex < run.totalChunks ? 'mapping' as const : 'reducing' as const;
    await ctx.db.patch(run._id, {
      status: resumedStatus,
      resumeCount: (run.resumeCount ?? 0) + 1,
      lastResumedAt: now,
      deadLetterNodeId: undefined,
      deadLetterFailureClass: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      finishedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(file._id, { fullDocumentReviewStatus: 'building', updatedAt: now });
    await ctx.db.patch(operation._id, {
      resumeCount: operationResumeCount + 1,
      lastResumedAt: now,
      lastResumeFailureClass: run.deadLetterFailureClass,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: run._id });
    return {
      resumed: true as const,
      status: resumedStatus,
      replacementRunId: run._id,
      nextChunkIndex: run.nextChunkIndex,
      totalChunks: run.totalChunks,
      priorFailureClass: run.deadLetterFailureClass,
      resumeCount: operationResumeCount + 1,
    };
  },
});

export const verify = mutation({
  args: { secret: v.string(), operationId: v.string() },
  handler: async (ctx, args) => {
    requireOperationsSecret(args.secret);
    const operation = await ctx.db.query('durableReviewRepairOperations')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
    if (!operation?.replacementRunId) throw new Error('durable_review_replacement_missing');
    const [run, file] = await Promise.all([
      ctx.db.get(operation.replacementRunId),
      ctx.db.get(operation.uploadedFileId),
    ]);
    const coverage = await loadVerifiedCoverage(ctx, {
      uploadedFileId: operation.uploadedFileId,
      memoryGenerationId: operation.memoryGenerationId,
      coverageManifestId: operation.coverageManifestId,
      expectedUnits: operation.expectedUnits,
    });
    const record = run
      ? await ctx.db.query('documentUnderstandingRecords').withIndex('by_run', (q) => q.eq('runId', run._id)).unique()
      : null;
    const checks = {
      runReady: run?.status === 'ready',
      runVersionCurrent: run?.version === DURABLE_REVIEW_VERSION,
      filePointsToReplacement: file?.activeUnderstandingRunId === run?._id,
      filePointsToRecord: Boolean(record && file?.activeUnderstandingRecordId === record._id),
      fileReviewReady: file?.fullDocumentReviewStatus === 'ready',
      recordVerified: record?.verificationStatus === 'verified',
      recordCoversEveryChunk: Boolean(record && record.coveredChunks === operation.totalChunks && record.totalChunks === operation.totalChunks),
      sourceUnitsVerified: coverage.verification.unitsRead === operation.expectedUnits,
    };
    const passed = Object.values(checks).every(Boolean);
    if (passed) {
      const now = Date.now();
      if (run && (run.errorCode || run.errorMessage || run.deadLetterNodeId || run.deadLetterFailureClass)) {
        await ctx.db.patch(run._id, {
          errorCode: undefined,
          errorMessage: undefined,
          deadLetterNodeId: undefined,
          deadLetterFailureClass: undefined,
          updatedAt: now,
        });
      }
      if (operation.status !== 'verified') {
        await ctx.db.patch(operation._id, {
          status: 'verified',
          verifiedUnits: coverage.verification.unitsRead,
          verificationJson: JSON.stringify(checks),
          verifiedAt: now,
          updatedAt: now,
        });
      }
    }
    return {
      operationId: operation.operationId,
      status: passed ? 'verified' : operation.status,
      replacementRunId: operation.replacementRunId,
      replacementRunStatus: run?.status ?? 'missing',
      expectedUnits: operation.expectedUnits,
      verifiedUnits: coverage.verification.unitsRead,
      totalChunks: operation.totalChunks,
      coveredChunks: record?.coveredChunks ?? 0,
      nextChunkIndex: run?.nextChunkIndex ?? 0,
      currentLevel: run?.currentLevel ?? 0,
      nextNodeIndex: run?.nextNodeIndex ?? 0,
      resumeCount: operation.resumeCount ?? 0,
      checks,
      errorCode: passed ? undefined : run?.errorCode,
      errorMessage: passed ? undefined : run?.errorMessage,
    };
  },
});

export const status = query({
  args: { secret: v.string(), operationId: v.string() },
  handler: async (ctx, args) => {
    requireOperationsSecret(args.secret);
    return await ctx.db.query('durableReviewRepairOperations')
      .withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
      .unique();
  },
});

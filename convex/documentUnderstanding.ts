import OpenAI from 'openai';
import { v } from 'convex/values';
import { makeFunctionReference, type FunctionReference } from 'convex/server';
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  buildDocumentUnderstandingMapPrompt,
  buildDocumentUnderstandingReducePrompt,
  mergeDocumentUnderstandingPayloads,
  renderVerifiedDocumentReview,
  verifyDocumentUnderstanding,
  verifyDocumentUnderstandingNode,
  type DocumentUnderstandingFinding,
  type DocumentUnderstandingPayload,
} from '../src/lib/nexx/documentUnderstanding';
import { stableCapabilityHash } from '../src/lib/nexx/capabilities/documentCapabilityLedger';
import {
  DURABLE_REVIEW_NODE_MAX_ATTEMPTS,
  classifyDurableReviewFailure,
  durableReviewGenerationProfile,
  durableReviewNodeId,
  durableReviewRetryDecision,
  strictStructuredOutputReminder,
  type DurableReviewFailureClass,
} from '../src/lib/nexx/durableReviewPolicy';
import { getAuthenticatedUser } from './lib/auth';
import { getExecutiveChatFeatureFlags } from '../src/lib/nexx/orchestration/featureFlags';
import { verifyCompleteSourceCoverage } from '../src/lib/nexx/sourceCoverageVerification';
import {
  DURABLE_REVIEW_MAP_BATCH_SIZE,
  DURABLE_REVIEW_MODEL,
  DURABLE_REVIEW_REDUCE_BATCH_SIZE,
  DURABLE_REVIEW_VERSION,
} from '../src/lib/nexx/durableReviewRuntime';

const LEGACY_UNDERSTANDING_VERSION = 'dur_v1';
const UNDERSTANDING_VERSION = DURABLE_REVIEW_VERSION;
const UNDERSTANDING_MODEL = DURABLE_REVIEW_MODEL;
const MAP_CHUNKS = DURABLE_REVIEW_MAP_BATCH_SIZE;
const REDUCE_NODES = DURABLE_REVIEW_REDUCE_BATCH_SIZE;
const NODE_LEASE_MS = 120_000;
const PROCESS_RUN_REFERENCE = makeFunctionReference<'action', { runId: Id<'documentUnderstandingRuns'> }, unknown>(
  'documentUnderstanding:processRun',
) as unknown as FunctionReference<'action', 'internal', { runId: Id<'documentUnderstandingRuns'> }, unknown>;

const findingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string' },
    title: { type: 'string' },
    detail: { type: 'string' },
    quote: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: ['category', 'title', 'detail', 'quote', 'sourceIds'],
} as const;

const DUR_SCHEMA = {
  type: 'json_schema' as const,
  name: 'document_understanding_node',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      overview: { type: 'string' },
      findings: { type: 'array', items: findingSchema, minItems: 1 },
      uncertainties: { type: 'array', items: { type: 'string' } },
    },
    required: ['overview', 'findings', 'uncertainties'],
  },
} as const;

type UnderstandingWork =
  | { kind: 'map'; run: Doc<'documentUnderstandingRuns'>; file: Doc<'uploadedFiles'>; chunks: Doc<'documentChunks'>[]; outputNodeIndex: number }
  | { kind: 'reduce' | 'finalize'; run: Doc<'documentUnderstandingRuns'>; file: Doc<'uploadedFiles'>; nodes: Doc<'documentUnderstandingNodes'>[]; levelCount: number; outputNodeIndex: number };

class UnderstandingNodeGenerationError extends Error {
  constructor(
    message: string,
    readonly outputJson?: string,
    readonly providerRequestId?: string,
  ) {
    super(message);
    this.name = 'UnderstandingNodeGenerationError';
  }
}

function parsePayload(value: string): DocumentUnderstandingPayload {
  const parsed = JSON.parse(value) as Partial<DocumentUnderstandingPayload>;
  if (!Array.isArray(parsed.findings) || !Array.isArray(parsed.uncertainties)) {
    throw new Error('Understanding provider returned an invalid payload.');
  }
  const findings = parsed.findings.filter((finding): finding is DocumentUnderstandingFinding =>
    Boolean(finding && typeof finding.category === 'string' && typeof finding.title === 'string' &&
      typeof finding.detail === 'string' && typeof finding.quote === 'string' &&
      Array.isArray(finding.sourceIds) && finding.sourceIds.length > 0 &&
      finding.sourceIds.every((sourceId) => typeof sourceId === 'string')));
  if (findings.length === 0 || findings.length !== parsed.findings.length ||
      parsed.uncertainties.some((item) => typeof item !== 'string')) {
    throw new Error('Understanding provider returned incomplete or malformed findings.');
  }
  return {
    overview: typeof parsed.overview === 'string' ? parsed.overview : '',
    findings,
    uncertainties: parsed.uncertainties.filter((item): item is string => typeof item === 'string'),
  };
}

function pageCitation(pageStart?: number, pageEnd?: number) {
  if (!pageStart) return '[source location unavailable]';
  return pageEnd && pageEnd !== pageStart ? `[pp. ${pageStart}-${pageEnd}]` : `[p. ${pageStart}]`;
}

async function generateNode(prompt: string, options: { strictRetry: boolean; batchSize: number }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 110_000 });
  const profile = durableReviewGenerationProfile(options);
  const response = await client.responses.create({
    model: UNDERSTANDING_MODEL,
    reasoning: { effort: profile.reasoningEffort },
    max_output_tokens: profile.maxOutputTokens,
    input: options.strictRetry ? `${prompt}\n\n${strictStructuredOutputReminder()}` : prompt,
    text: { format: DUR_SCHEMA },
  });
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason ?? 'unknown';
    throw new UnderstandingNodeGenerationError(
      `Understanding provider returned truncated or incomplete output: ${reason}.`,
      response.output_text || undefined,
      response.id,
    );
  }
  if (!response.output_text?.trim()) throw new Error('Understanding provider returned no output.');
  let payload: DocumentUnderstandingPayload;
  try {
    payload = parsePayload(response.output_text);
  } catch (error) {
    throw new UnderstandingNodeGenerationError(
      error instanceof Error ? error.message : String(error),
      response.output_text,
      response.id,
    );
  }
  return {
    payload,
    outputJson: response.output_text,
    providerRequestId: response.id,
    maxOutputTokens: profile.maxOutputTokens,
  };
}

export const startRun = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    uploadSessionId: v.optional(v.id('chatUploadSessions')),
    processingLockId: v.optional(v.string()),
    uploadCompletionStatus: v.optional(v.union(v.literal('ready'), v.literal('partial'))),
    uploadIndexingError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [file, generation] = await Promise.all([
      ctx.db.get(args.uploadedFileId),
      ctx.db.get(args.memoryGenerationId),
    ]);
    if (!file || !generation || file.activeMemoryGenerationId !== generation._id) {
      throw new Error('Cannot start understanding for a non-active document generation.');
    }
    if (file.deletedAt || file.status === 'deleted' || file.status === 'quarantined') {
      throw new Error('Cannot start understanding for a quarantined document.');
    }
    if (!generation.coverageManifestId) throw new Error('Document has no coverage manifest.');
    const manifest = await ctx.db.get(generation.coverageManifestId);
    if (!manifest || manifest.status !== 'complete') throw new Error('Document coverage is not complete.');
    const chunks = await ctx.db.query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', generation._id))
      .collect();
    if (chunks.length === 0) throw new Error('Document has no canonical chunks.');
    const understandingVersion = getExecutiveChatFeatureFlags().understandingResumeV2
      ? UNDERSTANDING_VERSION
      : LEGACY_UNDERSTANDING_VERSION;
    const existingRun = (await ctx.db.query('documentUnderstandingRuns')
      .withIndex('by_file_created', (q) => q.eq('uploadedFileId', file._id))
      .order('desc')
      .take(10))
      .find((candidate) =>
        candidate.memoryGenerationId === generation._id && candidate.version === understandingVersion
      );
    if (existingRun) {
      if (!['ready', 'dead_letter', 'failed'].includes(existingRun.status)) {
        await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: existingRun._id });
      }
      return {
        runId: existingRun._id,
        stableJobId: existingRun.stableJobId ?? `dur_legacy_${existingRun._id}`,
      };
    }
    const now = Date.now();
    const stableJobId = `dur_${stableCapabilityHash({
      uploadedFileId: file._id,
      dataProvenance: file.dataProvenance ?? 'production',
      qaRunId: file.qaRunId,
      memoryGenerationId: generation._id,
      coverageManifestId: manifest._id,
      version: understandingVersion,
    }).slice(0, 28)}`;
    const runId = await ctx.db.insert('documentUnderstandingRuns', {
      uploadedFileId: file._id,
      dataProvenance: file.dataProvenance ?? 'production',
      qaRunId: file.qaRunId,
      memoryGenerationId: generation._id,
      coverageManifestId: manifest._id,
      uploadSessionId: args.uploadSessionId,
      processingLockId: args.processingLockId,
      uploadCompletionStatus: args.uploadCompletionStatus,
      uploadIndexingError: args.uploadIndexingError,
      clerkUserId: file.clerkUserId,
      status: 'queued',
      version: understandingVersion,
      model: UNDERSTANDING_MODEL,
      stableJobId,
      totalChunks: chunks.length,
      nextChunkIndex: 0,
      currentLevel: 0,
      nextNodeIndex: 0,
      mapBatchSize: MAP_CHUNKS,
      reduceBatchSize: REDUCE_NODES,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(file._id, {
      activeUnderstandingRunId: runId,
      activeUnderstandingRecordId: undefined,
      fullDocumentReviewStatus: 'building',
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId });
    return { runId, stableJobId };
  },
});

export const getWork = internalQuery({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || ['ready', 'partial', 'failed', 'dead_letter'].includes(run.status)) return null;
    const file = await ctx.db.get(run.uploadedFileId);
    if (!file || file.activeUnderstandingRunId !== run._id || file.activeMemoryGenerationId !== run.memoryGenerationId) return null;
    if (run.status === 'queued' || run.status === 'mapping') {
      const [chunks, mappedNodes] = await Promise.all([
        ctx.db.query('documentChunks')
          .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', run.memoryGenerationId).gte('chunkIndex', run.nextChunkIndex))
          .take(Math.max(1, run.mapBatchSize ?? MAP_CHUNKS)),
        ctx.db.query('documentUnderstandingNodes')
          .withIndex('by_run_level_node', (q) => q.eq('runId', run._id).eq('level', 0))
          .collect(),
      ]);
      return { kind: 'map' as const, run, file, chunks, outputNodeIndex: mappedNodes.length };
    }
    const [nodes, levelNodes, nextLevelNodes] = await Promise.all([
      ctx.db.query('documentUnderstandingNodes')
        .withIndex('by_run_level_node', (q) => q.eq('runId', run._id).eq('level', run.currentLevel).gte('nodeIndex', run.nextNodeIndex))
        .take(Math.max(1, run.reduceBatchSize ?? REDUCE_NODES)),
      ctx.db.query('documentUnderstandingNodes')
        .withIndex('by_run_level_node', (q) => q.eq('runId', run._id).eq('level', run.currentLevel))
        .collect(),
      ctx.db.query('documentUnderstandingNodes')
        .withIndex('by_run_level_node', (q) => q.eq('runId', run._id).eq('level', run.currentLevel + 1))
        .collect(),
    ]);
    return {
      kind: levelNodes.length === 1 ? 'finalize' as const : 'reduce' as const,
      run,
      file,
      nodes,
      levelCount: levelNodes.length,
      outputNodeIndex: nextLevelNodes.length,
    };
  },
});

export const beginWorkNode = internalMutation({
  args: {
    runId: v.id('documentUnderstandingRuns'),
    expectedStatus: v.union(v.literal('mapping'), v.literal('reducing')),
    nodeId: v.string(),
    phase: v.union(v.literal('map'), v.literal('reduce')),
    level: v.number(),
    nodeIndex: v.number(),
    sourceStart: v.number(),
    sourceEnd: v.number(),
    batchSize: v.number(),
    inputHash: v.string(),
    deterministic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (
      !run ||
      (run.status !== args.expectedStatus && !(run.status === 'queued' && args.expectedStatus === 'mapping')) ||
      ['ready', 'failed', 'dead_letter'].includes(run.status)
    ) return { leased: false as const, reason: 'run_not_active' };

    const now = Date.now();
    let workNode = await ctx.db.query('documentUnderstandingWorkNodes')
      .withIndex('by_node_id', (q) => q.eq('nodeId', args.nodeId))
      .first();
    if (workNode && (
      workNode.runId !== run._id ||
      workNode.inputHash !== args.inputHash ||
      workNode.sourceStart !== args.sourceStart ||
      workNode.sourceEnd !== args.sourceEnd
    )) {
      throw new Error('Durable review node identity collision.');
    }
    if (workNode?.status === 'verified' || workNode?.status === 'exhausted') {
      return { leased: false as const, reason: workNode.status };
    }
    if (workNode?.status === 'running' && (workNode.leaseExpiresAt ?? 0) > now) {
      return { leased: false as const, reason: 'already_leased' };
    }
    if (workNode?.status === 'running') {
      const expiredAttempt = await ctx.db.query('documentUnderstandingNodeAttempts')
        .withIndex('by_work_node_attempt', (q) =>
          q.eq('workNodeId', workNode!._id).eq('attempt', workNode!.attemptCount)
        )
        .first();
      if (expiredAttempt?.status === 'running') {
        await ctx.db.patch(expiredAttempt._id, {
          status: 'failed', validationState: 'failed',
          validationErrors: ['worker_lease_expired'], failureClass: 'provider_transient',
          errorMessage: 'The review worker stopped before committing this node.', finishedAt: now,
        });
      }
    }

    const cycleAttempt = (workNode?.cycleAttemptCount ?? workNode?.attemptCount ?? 0) + 1;
    const attempt = (workNode?.attemptCount ?? 0) + 1;
    if (cycleAttempt > DURABLE_REVIEW_NODE_MAX_ATTEMPTS) {
      if (!workNode) return { leased: false as const, reason: 'attempt_budget_exhausted' };
      const decision = durableReviewRetryDecision({
        attempt: workNode.cycleAttemptCount ?? workNode.attemptCount,
        batchSize: workNode.batchSize,
        failureClass: 'provider_transient',
      });
      if (decision.kind === 'split_batch') {
        await ctx.db.patch(workNode._id, {
          status: 'exhausted', validationState: 'failed',
          validationErrors: ['worker_lease_expired'], failureClass: 'provider_transient',
          lastErrorMessage: 'The review worker repeatedly stopped before committing this node.',
          leaseId: undefined, leaseExpiresAt: undefined, finishedAt: now, updatedAt: now,
        });
        await ctx.db.patch(run._id, {
          mapBatchSize: workNode.phase === 'map' ? decision.nextBatchSize : run.mapBatchSize,
          reduceBatchSize: workNode.phase === 'reduce' ? decision.nextBatchSize : run.reduceBatchSize,
          errorCode: 'node_split_after_worker_lease_expired', updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: run._id });
        return { leased: false as const, reason: 'batch_split_after_expired_lease' };
      }
      await ctx.db.patch(workNode._id, {
        status: 'exhausted', validationState: 'failed',
        validationErrors: ['worker_lease_expired'], failureClass: 'provider_transient',
        lastErrorMessage: 'The review worker repeatedly stopped before committing this node.',
        leaseId: undefined, leaseExpiresAt: undefined, finishedAt: now, updatedAt: now,
      });
      await ctx.db.patch(run._id, {
        status: 'dead_letter', deadLetterNodeId: workNode.nodeId,
        deadLetterFailureClass: 'provider_transient', errorCode: 'node_exhausted_worker_lease_expired',
        errorMessage: 'The review worker repeatedly stopped before committing this node.',
        updatedAt: now, finishedAt: now,
      });
      await ctx.db.patch(run.uploadedFileId, { fullDocumentReviewStatus: 'failed', updatedAt: now });
      return { leased: false as const, reason: 'dead_letter_after_expired_lease' };
    }
    const deterministic = Boolean(args.deterministic);
    const strictRetry = !deterministic && cycleAttempt >= 3;
    const executionModel = deterministic ? 'deterministic-merge-v1' : run.model;
    const leaseId = crypto.randomUUID();
    const workNodePatch = {
      status: 'running' as const,
      attemptCount: attempt,
      cycleAttemptCount: cycleAttempt,
      maxAttempts: DURABLE_REVIEW_NODE_MAX_ATTEMPTS,
      strictRetry,
      model: executionModel,
      leaseId,
      leaseExpiresAt: now + NODE_LEASE_MS,
      validationState: 'pending' as const,
      validationErrors: [],
      startedAt: workNode?.startedAt ?? now,
      updatedAt: now,
    };
    if (workNode) {
      await ctx.db.patch(workNode._id, workNodePatch);
      workNode = { ...workNode, ...workNodePatch };
    } else {
      const workNodeId = await ctx.db.insert('documentUnderstandingWorkNodes', {
        nodeId: args.nodeId,
        runId: run._id,
        uploadedFileId: run.uploadedFileId,
        dataProvenance: run.dataProvenance ?? 'production',
        qaRunId: run.qaRunId,
        memoryGenerationId: run.memoryGenerationId,
        phase: args.phase,
        level: args.level,
        nodeIndex: args.nodeIndex,
        sourceStart: args.sourceStart,
        sourceEnd: args.sourceEnd,
        batchSize: args.batchSize,
        inputHash: args.inputHash,
        createdAt: now,
        ...workNodePatch,
      });
      workNode = await ctx.db.get(workNodeId);
    }
    if (!workNode) throw new Error('Failed to create durable review work node.');
    const mode = deterministic
      ? 'deterministic_reduce' as const
      : cycleAttempt === 1
      ? (run.resumeCount ? 'operator_resume' as const : 'initial' as const)
      : cycleAttempt === 2 ? 'same_input_retry' as const : 'strict_retry' as const;
    const attemptId = await ctx.db.insert('documentUnderstandingNodeAttempts', {
      workNodeId: workNode._id,
      nodeId: args.nodeId,
      runId: run._id,
      attempt,
      cycleAttempt,
      mode,
      inputHash: stableCapabilityHash({ baseInputHash: args.inputHash, strictRetry }),
      status: 'running',
      validationState: 'pending',
      validationErrors: [],
      model: executionModel,
      maxOutputTokens: deterministic ? 0 : durableReviewGenerationProfile({ strictRetry, batchSize: args.batchSize }).maxOutputTokens,
      startedAt: now,
    });
    await ctx.db.patch(run._id, {
      status: args.expectedStatus,
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(NODE_LEASE_MS + 5_000, PROCESS_RUN_REFERENCE, { runId: run._id });
    return { leased: true as const, workNodeId: workNode._id, attemptId, leaseId, attempt, strictRetry };
  },
});

export const persistVerifiedNode = internalMutation({
  args: {
    runId: v.id('documentUnderstandingRuns'),
    workNodeId: v.id('documentUnderstandingWorkNodes'),
    attemptId: v.id('documentUnderstandingNodeAttempts'),
    leaseId: v.string(),
    expectedStatus: v.union(v.literal('mapping'), v.literal('reducing')),
    level: v.number(),
    nodeIndex: v.number(),
    sourceChunkStart: v.number(),
    sourceChunkEnd: v.number(),
    sourceChunkCount: v.number(),
    pageStart: v.optional(v.number()),
    pageEnd: v.optional(v.number()),
    payloadJson: v.string(),
    providerRequestId: v.optional(v.string()),
    nextChunkIndex: v.optional(v.number()),
    nextNodeIndex: v.optional(v.number()),
    finishLevel: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const [run, workNode, attempt] = await Promise.all([
      ctx.db.get(args.runId),
      ctx.db.get(args.workNodeId),
      ctx.db.get(args.attemptId),
    ]);
    if (
      !run || !workNode || !attempt ||
      workNode.runId !== run._id || attempt.workNodeId !== workNode._id ||
      workNode.leaseId !== args.leaseId || workNode.status !== 'running' ||
      (run.status !== args.expectedStatus && !(run.status === 'queued' && args.expectedStatus === 'mapping'))
    ) return false;

    const existing = await ctx.db.query('documentUnderstandingNodes')
      .withIndex('by_run_level_node', (q) =>
        q.eq('runId', run._id).eq('level', args.level).eq('nodeIndex', args.nodeIndex)
      )
      .first();
    if (existing) {
      if (
        existing.sourceChunkStart !== args.sourceChunkStart ||
        existing.sourceChunkEnd !== args.sourceChunkEnd ||
        existing.payloadJson !== args.payloadJson
      ) throw new Error('Durable review node output conflict.');
    } else {
      await ctx.db.insert('documentUnderstandingNodes', {
        runId: run._id,
        uploadedFileId: run.uploadedFileId,
        memoryGenerationId: run.memoryGenerationId,
        level: args.level,
        nodeIndex: args.nodeIndex,
        sourceChunkStart: args.sourceChunkStart,
        sourceChunkEnd: args.sourceChunkEnd,
        sourceChunkCount: args.sourceChunkCount,
        pageStart: args.pageStart,
        pageEnd: args.pageEnd,
        payloadJson: args.payloadJson,
        createdAt: Date.now(),
      });
    }
    const now = Date.now();
    await ctx.db.patch(workNode._id, {
      status: 'verified', outputJson: args.payloadJson, validationState: 'verified',
      validationErrors: [], providerRequestId: args.providerRequestId,
      leaseId: undefined, leaseExpiresAt: undefined, finishedAt: now, updatedAt: now,
    });
    await ctx.db.patch(attempt._id, {
      status: 'verified', outputJson: args.payloadJson, validationState: 'verified',
      validationErrors: [], providerRequestId: args.providerRequestId, finishedAt: now,
    });
    const mappingFinished = args.expectedStatus === 'mapping' && args.nextChunkIndex === run.totalChunks;
    await ctx.db.patch(run._id, {
      status: mappingFinished ? 'reducing' : args.expectedStatus,
      nextChunkIndex: args.nextChunkIndex ?? run.nextChunkIndex,
      currentLevel: args.finishLevel ? run.currentLevel + 1 : run.currentLevel,
      nextNodeIndex: args.finishLevel ? 0 : args.nextNodeIndex ?? run.nextNodeIndex,
      reduceBatchSize: args.finishLevel ? REDUCE_NODES : run.reduceBatchSize,
      lastVerifiedNodeId: workNode.nodeId,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: run._id });
    return true;
  },
});

export const recordNodeFailure = internalMutation({
  args: {
    runId: v.id('documentUnderstandingRuns'),
    workNodeId: v.id('documentUnderstandingWorkNodes'),
    attemptId: v.id('documentUnderstandingNodeAttempts'),
    leaseId: v.string(),
    failureClass: v.string(),
    errorMessage: v.string(),
    outputJson: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [run, workNode, attempt] = await Promise.all([
      ctx.db.get(args.runId), ctx.db.get(args.workNodeId), ctx.db.get(args.attemptId),
    ]);
    if (
      !run || !workNode || !attempt || workNode.runId !== run._id ||
      attempt.workNodeId !== workNode._id || workNode.leaseId !== args.leaseId ||
      workNode.status !== 'running'
    ) return { disposition: 'stale' as const };
    const failureClass = args.failureClass as DurableReviewFailureClass;
    const decision = durableReviewRetryDecision({
      attempt: workNode.cycleAttemptCount ?? workNode.attemptCount,
      batchSize: workNode.batchSize,
      failureClass,
    });
    const now = Date.now();
    const errorMessage = args.errorMessage.slice(0, 2_000);
    await ctx.db.patch(attempt._id, {
      status: 'failed', validationState: 'failed', validationErrors: [failureClass],
      failureClass, errorMessage, outputJson: args.outputJson,
      providerRequestId: args.providerRequestId, finishedAt: now,
    });
    if (decision.kind === 'retry_same' || decision.kind === 'retry_strict') {
      await ctx.db.patch(workNode._id, {
        status: 'retryable_failed', validationState: 'failed', validationErrors: [failureClass],
        failureClass, lastErrorMessage: errorMessage, leaseId: undefined, leaseExpiresAt: undefined,
        outputJson: args.outputJson, providerRequestId: args.providerRequestId,
        updatedAt: now,
      });
      await ctx.db.patch(run._id, {
        errorCode: `node_${failureClass}`, errorMessage, updatedAt: now,
      });
      await ctx.scheduler.runAfter(1_000, PROCESS_RUN_REFERENCE, { runId: run._id });
      return { disposition: decision.kind };
    }
    if (decision.kind === 'split_batch') {
      await ctx.db.patch(workNode._id, {
        status: 'exhausted', validationState: 'failed', validationErrors: [failureClass],
        failureClass, lastErrorMessage: errorMessage, leaseId: undefined, leaseExpiresAt: undefined,
        outputJson: args.outputJson, providerRequestId: args.providerRequestId,
        finishedAt: now, updatedAt: now,
      });
      await ctx.db.patch(run._id, {
        mapBatchSize: workNode.phase === 'map' ? decision.nextBatchSize : run.mapBatchSize,
        reduceBatchSize: workNode.phase === 'reduce' ? decision.nextBatchSize : run.reduceBatchSize,
        errorCode: `node_split_after_${failureClass}`, errorMessage, updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: run._id });
      return { disposition: decision.kind, nextBatchSize: decision.nextBatchSize };
    }

    await ctx.db.patch(workNode._id, {
      status: 'exhausted', validationState: 'failed', validationErrors: [failureClass],
      failureClass, lastErrorMessage: errorMessage, leaseId: undefined, leaseExpiresAt: undefined,
      outputJson: args.outputJson, providerRequestId: args.providerRequestId,
      finishedAt: now, updatedAt: now,
    });
    await ctx.db.patch(run._id, {
      status: 'dead_letter', deadLetterNodeId: workNode.nodeId,
      deadLetterFailureClass: failureClass, errorCode: `node_exhausted_${failureClass}`,
      errorMessage, updatedAt: now, finishedAt: now,
    });
    await ctx.db.patch(run.uploadedFileId, { fullDocumentReviewStatus: 'failed', updatedAt: now });
    if (run.uploadSessionId && run.processingLockId) {
      const session = await ctx.db.get(run.uploadSessionId);
      if (session?.processingLockId === run.processingLockId) {
        await ctx.db.patch(run.uploadSessionId, {
          status: 'partial', errorCode: `document_understanding_${failureClass}`,
          errorMessage: `The exhaustive review paused at one isolated node (${failureClass}). Completed review nodes were preserved and can be resumed.`,
          retryable: true, processingFinishedAt: now, updatedAt: now,
        });
      }
    }
    return { disposition: 'dead_letter' as const, failureClass };
  },
});

export const persistNode = internalMutation({
  args: {
    runId: v.id('documentUnderstandingRuns'),
    expectedStatus: v.union(v.literal('mapping'), v.literal('reducing')),
    level: v.number(),
    nodeIndex: v.number(),
    sourceChunkStart: v.number(),
    sourceChunkEnd: v.number(),
    sourceChunkCount: v.number(),
    pageStart: v.optional(v.number()),
    pageEnd: v.optional(v.number()),
    payloadJson: v.string(),
    nextChunkIndex: v.optional(v.number()),
    nextNodeIndex: v.optional(v.number()),
    finishLevel: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || (run.status !== args.expectedStatus && !(run.status === 'queued' && args.expectedStatus === 'mapping'))) return false;
    await ctx.db.insert('documentUnderstandingNodes', {
      runId: run._id,
      uploadedFileId: run.uploadedFileId,
      dataProvenance: run.dataProvenance ?? 'production',
      qaRunId: run.qaRunId,
      memoryGenerationId: run.memoryGenerationId,
      level: args.level,
      nodeIndex: args.nodeIndex,
      sourceChunkStart: args.sourceChunkStart,
      sourceChunkEnd: args.sourceChunkEnd,
      sourceChunkCount: args.sourceChunkCount,
      pageStart: args.pageStart,
      pageEnd: args.pageEnd,
      payloadJson: args.payloadJson,
      createdAt: Date.now(),
    });
    const mappingFinished = args.expectedStatus === 'mapping' && args.nextChunkIndex === run.totalChunks;
    await ctx.db.patch(run._id, {
      status: mappingFinished ? 'reducing' : args.expectedStatus,
      nextChunkIndex: args.nextChunkIndex ?? run.nextChunkIndex,
      currentLevel: args.finishLevel ? run.currentLevel + 1 : run.currentLevel,
      nextNodeIndex: args.finishLevel ? 0 : args.nextNodeIndex ?? run.nextNodeIndex,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: run._id });
    return true;
  },
});

export const finalizeRun = internalMutation({
  args: {
    runId: v.id('documentUnderstandingRuns'),
    structuredJson: v.string(),
    renderedReviewMarkdown: v.string(),
    sourceChunkIds: v.array(v.id('documentChunks')),
    sourceChunkIndexes: v.array(v.number()),
    checks: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return false;
    const finalizationHash = stableCapabilityHash({
      runId: run._id,
      structuredJson: args.structuredJson,
      sourceChunkIds: args.sourceChunkIds,
      sourceChunkIndexes: args.sourceChunkIndexes,
      checks: args.checks,
    });
    const existingRecord = await ctx.db.query('documentUnderstandingRecords')
      .withIndex('by_run', (q) => q.eq('runId', run._id))
      .first();
    if (existingRecord) {
      if (existingRecord.finalizationHash && existingRecord.finalizationHash !== finalizationHash) {
        throw new Error('Document understanding finalization conflict.');
      }
      if (run.status === 'ready' && (
        run.errorCode || run.errorMessage || run.deadLetterNodeId || run.deadLetterFailureClass
      )) {
        await ctx.db.patch(run._id, {
          errorCode: undefined,
          errorMessage: undefined,
          deadLetterNodeId: undefined,
          deadLetterFailureClass: undefined,
          updatedAt: Date.now(),
        });
      }
      return run.status === 'ready';
    }
    if (run.status !== 'reducing') return false;
    const expectedIndexes = Array.from({ length: run.totalChunks }, (_, index) => index);
    const actualIndexes = Array.from(new Set(args.sourceChunkIndexes)).sort((a, b) => a - b);
    if (
      actualIndexes.length !== expectedIndexes.length ||
      actualIndexes.some((value, index) => value !== expectedIndexes[index]) ||
      args.sourceChunkIds.length !== run.totalChunks
    ) {
      throw new Error('Final review cannot be verified complete because canonical chunk coverage is incomplete.');
    }
    const now = Date.now();
    const recordId = await ctx.db.insert('documentUnderstandingRecords', {
      runId: run._id,
      uploadedFileId: run.uploadedFileId,
      dataProvenance: run.dataProvenance ?? 'production',
      qaRunId: run.qaRunId,
      memoryGenerationId: run.memoryGenerationId,
      coverageManifestId: run.coverageManifestId,
      version: run.version,
      model: run.model,
      structuredJson: args.structuredJson,
      renderedReviewMarkdown: args.renderedReviewMarkdown,
      sourceChunkIds: args.sourceChunkIds,
      sourceChunkIndexes: args.sourceChunkIndexes,
      verificationStatus: 'verified',
      verificationChecks: args.checks,
      finalizationHash,
      totalChunks: run.totalChunks,
      coveredChunks: args.sourceChunkIndexes.length,
      createdAt: now,
    });
    await ctx.db.patch(run._id, {
      status: 'ready',
      errorCode: undefined,
      errorMessage: undefined,
      deadLetterNodeId: undefined,
      deadLetterFailureClass: undefined,
      updatedAt: now,
      finishedAt: now,
    });
    await ctx.db.patch(run.uploadedFileId, {
      activeUnderstandingRecordId: recordId,
      fullDocumentReviewStatus: 'ready',
      updatedAt: now,
    });
    if (run.uploadSessionId && run.processingLockId) {
      const session = await ctx.db.get(run.uploadSessionId);
      if (session?.processingLockId === run.processingLockId) {
        await ctx.db.patch(run.uploadSessionId, {
          status: run.uploadCompletionStatus ?? 'ready',
          uploadedFileId: run.uploadedFileId,
          errorCode: run.uploadIndexingError ? 'indexing_partial_failure' : undefined,
          errorMessage: run.uploadIndexingError,
          retryable: false,
          processingFinishedAt: now,
          updatedAt: now,
        });
      }
    }
    return true;
  },
});

export const failRun = internalMutation({
  args: {
    runId: v.id('documentUnderstandingRuns'),
    errorCode: v.string(),
    errorMessage: v.string(),
    failureClass: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || ['ready', 'failed', 'dead_letter'].includes(run.status)) return false;
    const now = Date.now();
    const deadLetter = run.version === UNDERSTANDING_VERSION;
    await ctx.db.patch(run._id, {
      status: deadLetter ? 'dead_letter' : 'failed',
      deadLetterFailureClass: deadLetter ? args.failureClass ?? 'unknown' : undefined,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage.slice(0, 2_000),
      updatedAt: now,
      finishedAt: now,
    });
    await ctx.db.patch(run.uploadedFileId, { fullDocumentReviewStatus: 'failed', updatedAt: now });
    if (run.uploadSessionId && run.processingLockId) {
      const session = await ctx.db.get(run.uploadSessionId);
      if (session?.processingLockId === run.processingLockId) {
        await ctx.db.patch(run.uploadSessionId, {
          status: 'partial', errorCode: 'document_understanding_failed',
          errorMessage: 'The file was extracted, but exhaustive review did not finish. Retry processing before relying on a full-document summary.',
          retryable: true, processingFinishedAt: now, updatedAt: now,
        });
      }
    }
    return true;
  },
});

async function processLegacyWork(ctx: ActionCtx, work: UnderstandingWork) {
  if (work.kind === 'map') {
    if (work.chunks.length === 0) throw new Error('Map phase ended without a complete chunk range.');
    const first = work.chunks[0];
    const last = work.chunks[work.chunks.length - 1];
    const source = work.chunks.map((chunk) =>
      `SOURCE_CHUNK_${chunk.chunkIndex} | ${pageCitation(chunk.pageStart, chunk.pageEnd)}\n${chunk.text}`).join('\n\n');
    const generated = await generateNode(buildDocumentUnderstandingMapPrompt(source), {
      strictRetry: false,
      batchSize: work.chunks.length,
    });
    await ctx.runMutation(internal.documentUnderstanding.persistNode, {
      runId: work.run._id, expectedStatus: 'mapping', level: 0,
      nodeIndex: work.outputNodeIndex,
      sourceChunkStart: first.chunkIndex, sourceChunkEnd: last.chunkIndex,
      sourceChunkCount: work.chunks.length,
      pageStart: first.pageStart, pageEnd: last.pageEnd ?? last.pageStart,
      payloadJson: JSON.stringify(generated.payload), nextChunkIndex: last.chunkIndex + 1,
    });
    return { phase: 'mapping', throughChunk: last.chunkIndex };
  }
  if (work.kind === 'reduce') {
    if (work.nodes.length === 0) throw new Error('Reduce phase found no nodes.');
    const first = work.nodes[0];
    const last = work.nodes[work.nodes.length - 1];
    const generated = await generateNode(buildDocumentUnderstandingReducePrompt(work.nodes.map((node) => node.payloadJson)), {
      strictRetry: false,
      batchSize: work.nodes.length,
    });
    const consumed = first.nodeIndex + work.nodes.length;
    await ctx.runMutation(internal.documentUnderstanding.persistNode, {
      runId: work.run._id, expectedStatus: 'reducing', level: work.run.currentLevel + 1,
      nodeIndex: work.outputNodeIndex,
      sourceChunkStart: first.sourceChunkStart, sourceChunkEnd: last.sourceChunkEnd,
      sourceChunkCount: work.nodes.reduce((sum, node) => sum + node.sourceChunkCount, 0),
      pageStart: first.pageStart, pageEnd: last.pageEnd,
      payloadJson: JSON.stringify(generated.payload), nextNodeIndex: consumed,
      finishLevel: consumed >= work.levelCount,
    });
    return { phase: 'reducing', level: work.run.currentLevel };
  }
  return null;
}

export const processRun = internalAction({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args): Promise<Record<string, unknown> | null> => {
    try {
      const work = await ctx.runQuery(internal.documentUnderstanding.getWork, args) as UnderstandingWork | null;
      if (!work) return null;
      if (work.run.version !== UNDERSTANDING_VERSION) {
        const legacyResult = await processLegacyWork(ctx, work);
        if (legacyResult) return legacyResult;
      }
      if (work.kind === 'map') {
        if (work.chunks.length === 0) throw new Error('Map phase ended without a complete chunk range.');
        const first = work.chunks[0];
        const last = work.chunks[work.chunks.length - 1];
        const source = work.chunks.map((chunk) =>
          `SOURCE_CHUNK_${chunk.chunkIndex} | ${pageCitation(chunk.pageStart, chunk.pageEnd)}\n${chunk.text}`).join('\n\n');
        const prompt = buildDocumentUnderstandingMapPrompt(source);
        const inputHash = stableCapabilityHash(prompt);
        const nodeId = durableReviewNodeId({
          stableJobId: work.run.stableJobId ?? `dur_legacy_${work.run._id}`,
          phase: 'map', level: 0, sourceStart: first.chunkIndex, sourceEnd: last.chunkIndex, inputHash,
        });
        const lease = await ctx.runMutation(internal.documentUnderstanding.beginWorkNode, {
          runId: work.run._id, expectedStatus: 'mapping', nodeId, phase: 'map', level: 0,
          nodeIndex: work.outputNodeIndex, sourceStart: first.chunkIndex, sourceEnd: last.chunkIndex,
          batchSize: work.chunks.length, inputHash,
        });
        if (!lease.leased) return { phase: 'mapping', disposition: lease.reason };
        try {
          const generated = await generateNode(prompt, { strictRetry: lease.strictRetry, batchSize: work.chunks.length });
          const verification = verifyDocumentUnderstandingNode({
            payload: generated.payload,
            chunks: work.chunks,
            provenance: {
              sourceChunkStart: first.chunkIndex,
              sourceChunkEnd: last.chunkIndex,
              sourceChunkCount: work.chunks.length,
            },
          });
          if (!verification.passed) throw new Error(`Node schema validation failed: ${verification.errors.join(' | ')}`);
          await ctx.runMutation(internal.documentUnderstanding.persistVerifiedNode, {
            runId: work.run._id, workNodeId: lease.workNodeId, attemptId: lease.attemptId,
            leaseId: lease.leaseId, expectedStatus: 'mapping', level: 0,
            nodeIndex: work.outputNodeIndex, sourceChunkStart: first.chunkIndex, sourceChunkEnd: last.chunkIndex,
            sourceChunkCount: work.chunks.length, pageStart: first.pageStart,
            pageEnd: last.pageEnd ?? last.pageStart, payloadJson: JSON.stringify(generated.payload),
            providerRequestId: generated.providerRequestId, nextChunkIndex: last.chunkIndex + 1,
          });
          return { phase: 'mapping', throughChunk: last.chunkIndex, attempt: lease.attempt };
        } catch (error) {
          const failureClass = classifyDurableReviewFailure(error);
          const outcome = await ctx.runMutation(internal.documentUnderstanding.recordNodeFailure, {
            runId: work.run._id, workNodeId: lease.workNodeId, attemptId: lease.attemptId,
            leaseId: lease.leaseId, failureClass,
            errorMessage: error instanceof Error ? error.message : String(error),
            outputJson: error instanceof UnderstandingNodeGenerationError ? error.outputJson : undefined,
            providerRequestId: error instanceof UnderstandingNodeGenerationError ? error.providerRequestId : undefined,
          });
          return { phase: 'mapping', failureClass, ...outcome };
        }
      }
      if (work.kind === 'reduce') {
        if (work.nodes.length === 0) throw new Error('Reduce phase found no nodes.');
        const first = work.nodes[0];
        const last = work.nodes[work.nodes.length - 1];
        const mergedPayload = mergeDocumentUnderstandingPayloads(work.nodes.map((node) => parsePayload(node.payloadJson)));
        const inputHash = stableCapabilityHash({
          mode: 'deterministic_reduce_v1',
          nodes: work.nodes.map((node) => ({
            id: node._id,
            sourceChunkStart: node.sourceChunkStart,
            sourceChunkEnd: node.sourceChunkEnd,
            payloadHash: stableCapabilityHash(node.payloadJson),
          })),
        });
        const nodeId = durableReviewNodeId({
          stableJobId: work.run.stableJobId ?? `dur_legacy_${work.run._id}`,
          phase: 'reduce', level: work.run.currentLevel + 1,
          sourceStart: first.nodeIndex, sourceEnd: last.nodeIndex, inputHash,
        });
        const lease = await ctx.runMutation(internal.documentUnderstanding.beginWorkNode, {
          runId: work.run._id, expectedStatus: 'reducing', nodeId, phase: 'reduce',
          level: work.run.currentLevel + 1, nodeIndex: work.outputNodeIndex,
          sourceStart: first.nodeIndex, sourceEnd: last.nodeIndex,
          batchSize: work.nodes.length, inputHash, deterministic: true,
        });
        if (!lease.leased) return { phase: 'reducing', disposition: lease.reason };
        const consumed = first.nodeIndex + work.nodes.length;
        try {
          const allChunks = await ctx.runQuery(internal.documentUnderstanding.getAllChunks, { runId: work.run._id });
          const chunks = allChunks.filter((chunk) =>
            chunk.chunkIndex >= first.sourceChunkStart && chunk.chunkIndex <= last.sourceChunkEnd
          );
          const verification = verifyDocumentUnderstandingNode({
            payload: mergedPayload,
            chunks,
            provenance: {
              sourceChunkStart: first.sourceChunkStart,
              sourceChunkEnd: last.sourceChunkEnd,
              sourceChunkCount: work.nodes.reduce((sum, node) => sum + node.sourceChunkCount, 0),
            },
          });
          if (!verification.passed) throw new Error(`Node schema validation failed: ${verification.errors.join(' | ')}`);
          await ctx.runMutation(internal.documentUnderstanding.persistVerifiedNode, {
            runId: work.run._id, workNodeId: lease.workNodeId, attemptId: lease.attemptId,
            leaseId: lease.leaseId, expectedStatus: 'reducing', level: work.run.currentLevel + 1,
            nodeIndex: work.outputNodeIndex, sourceChunkStart: first.sourceChunkStart,
            sourceChunkEnd: last.sourceChunkEnd,
            sourceChunkCount: work.nodes.reduce((sum, node) => sum + node.sourceChunkCount, 0),
            pageStart: first.pageStart, pageEnd: last.pageEnd,
            payloadJson: JSON.stringify(mergedPayload),
            nextNodeIndex: consumed, finishLevel: consumed >= work.levelCount,
          });
          return { phase: 'reducing', level: work.run.currentLevel, attempt: lease.attempt };
        } catch (error) {
          const failureClass = classifyDurableReviewFailure(error);
          const outcome = await ctx.runMutation(internal.documentUnderstanding.recordNodeFailure, {
            runId: work.run._id, workNodeId: lease.workNodeId, attemptId: lease.attemptId,
            leaseId: lease.leaseId, failureClass,
            errorMessage: error instanceof Error ? error.message : String(error),
            outputJson: error instanceof UnderstandingNodeGenerationError ? error.outputJson : undefined,
            providerRequestId: error instanceof UnderstandingNodeGenerationError ? error.providerRequestId : undefined,
          });
          return { phase: 'reducing', failureClass, ...outcome };
        }
      }
      const root = work.nodes[0];
      const chunks = await ctx.runQuery(internal.documentUnderstanding.getAllChunks, { runId: work.run._id });
      const coverageReceipt = await ctx.runQuery(internal.documentUnderstanding.getCoverageReceipt, { runId: work.run._id });
      if (!root) throw new Error('Understanding reduction produced no root node.');
      if (!coverageReceipt) throw new Error('Document source coverage could not be verified complete.');
      const payload = parsePayload(root.payloadJson);
      const verification = verifyDocumentUnderstanding({ payload, chunks, provenance: root });
      if (!verification.passed) throw new Error(verification.errors.join(' | '));
      const sourceChunkIndexes = chunks.map((chunk) => chunk.chunkIndex);
      await ctx.runMutation(internal.documentUnderstanding.finalizeRun, {
        runId: work.run._id,
        structuredJson: JSON.stringify(payload),
        renderedReviewMarkdown: renderVerifiedDocumentReview({
          filename: work.file.filename,
          payload,
          chunks,
          sourceUrl: `/api/documents/source/${work.file._id}`,
          coverageReceipt,
        }),
        sourceChunkIds: chunks.map((chunk) => chunk._id),
        sourceChunkIndexes,
        checks: ['coverage_manifest_complete', ...verification.checks],
      });
      return { phase: 'ready', chunks: chunks.length, findings: payload.findings.length };
    } catch (error) {
      const failureClass = classifyDurableReviewFailure(error);
      await ctx.runMutation(internal.documentUnderstanding.failRun, {
        runId: args.runId,
        errorCode: `understanding_${failureClass}`,
        errorMessage: error instanceof Error ? error.message : String(error),
        failureClass,
      });
      return { phase: 'failed', failureClass };
    }
  },
});

export const getAllChunks = internalQuery({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return [];
    return await ctx.db.query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', run.memoryGenerationId))
      .collect();
  },
});

export const getCoverageReceipt = internalQuery({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return undefined;
    const manifest = await ctx.db.get(run.coverageManifestId);
    if (!manifest || manifest.status !== 'complete') return undefined;
    const units = await ctx.db.query('documentSourceUnitCoverage')
      .withIndex('by_manifest_unit', (q) => q.eq('manifestId', manifest._id))
      .collect();
    const verification = verifyCompleteSourceCoverage({ manifest, units });
    if (!verification.passed) return undefined;
    return {
      unitKind: manifest.unitKind,
      unitsRead: verification.unitsRead,
      unitsExpected: verification.unitsExpected,
      ocrUnits: units.filter((unit) => unit.ocrApplied).length,
      lowConfidenceUnits: manifest.lowConfidenceUnits,
    };
  },
});

export const getActiveRecord = internalQuery({
  args: { uploadedFileId: v.id('uploadedFiles') },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.uploadedFileId);
    if (!file?.activeUnderstandingRecordId || file.fullDocumentReviewStatus !== 'ready' || file.status === 'quarantined') return null;
    const record = await ctx.db.get(file.activeUnderstandingRecordId);
    if (!record || record.memoryGenerationId !== file.activeMemoryGenerationId || record.verificationStatus !== 'verified') return null;
    return record;
  },
});

export const getOwnedRunStatus = query({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.clerkUserId !== user.clerkId) throw new Error('Not authorized to inspect this review run.');
    const file = await ctx.db.get(run.uploadedFileId);
    if (!file || file.deletedAt || file.status === 'deleted' || file.status === 'quarantined') {
      throw new Error('Not authorized to inspect this review run.');
    }
    const nodes = await ctx.db.query('documentUnderstandingWorkNodes')
      .withIndex('by_run_status', (q) => q.eq('runId', run._id))
      .collect();
    return {
      runId: run._id,
      stableJobId: run.stableJobId,
      status: run.status,
      totalChunks: run.totalChunks,
      nextChunkIndex: run.nextChunkIndex,
      currentLevel: run.currentLevel,
      verifiedNodes: nodes.filter((node) => node.status === 'verified').length,
      retryingNodes: nodes.filter((node) => node.status === 'retryable_failed' || node.status === 'running').length,
      exhaustedNodes: nodes.filter((node) => node.status === 'exhausted').length,
      failureClass: run.deadLetterFailureClass,
      errorCode: run.errorCode,
      canResume: run.status === 'dead_letter' || run.status === 'failed' || run.status === 'partial',
      resumeCount: run.resumeCount ?? 0,
      updatedAt: run.updatedAt,
    };
  },
});

export const resumeOwnedRun = mutation({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.clerkUserId !== user.clerkId) throw new Error('Not authorized to resume this review run.');
    if (!['dead_letter', 'failed', 'partial'].includes(run.status)) {
      return { resumed: false, status: run.status, reason: 'run_not_failed' };
    }
    const file = await ctx.db.get(run.uploadedFileId);
    if (!file || file.clerkUserId !== user.clerkId || file.activeMemoryGenerationId !== run.memoryGenerationId || file.status === 'quarantined') {
      throw new Error('The failed review no longer matches the active document version.');
    }
    const now = Date.now();
    if (run.deadLetterNodeId) {
      const node = await ctx.db.query('documentUnderstandingWorkNodes')
        .withIndex('by_node_id', (q) => q.eq('nodeId', run.deadLetterNodeId!))
        .first();
      if (node?.runId === run._id) {
        await ctx.db.patch(node._id, {
          status: 'retryable_failed', cycleAttemptCount: 0, strictRetry: false,
          leaseId: undefined, leaseExpiresAt: undefined,
          validationState: 'pending', validationErrors: [],
          failureClass: undefined, lastErrorMessage: undefined,
          finishedAt: undefined, updatedAt: now,
        });
      }
    }
    const resumedStatus = run.nextChunkIndex < run.totalChunks ? 'mapping' as const : 'reducing' as const;
    await ctx.db.patch(run._id, {
      status: resumedStatus,
      resumeCount: (run.resumeCount ?? 0) + 1,
      lastResumedByUserId: user._id,
      lastResumedAt: now,
      deadLetterNodeId: undefined,
      deadLetterFailureClass: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      finishedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(file._id, { fullDocumentReviewStatus: 'building', updatedAt: now });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId: run._id });
    return { resumed: true, status: resumedStatus, priorFailureClass: run.deadLetterFailureClass };
  },
});

export const restartOwnedDocumentVersion = mutation({
  args: { uploadedFileId: v.id('uploadedFiles') },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const file = await ctx.db.get(args.uploadedFileId);
    if (!file || file.clerkUserId !== user.clerkId || file.status === 'quarantined') throw new Error('Not authorized to restart this document review.');
    if (!file.activeMemoryGenerationId) throw new Error('Document has no active memory generation.');
    const generation = await ctx.db.get(file.activeMemoryGenerationId);
    if (!generation?.coverageManifestId) throw new Error('Document has no complete coverage manifest.');
    const manifest = await ctx.db.get(generation.coverageManifestId);
    if (!manifest || manifest.status !== 'complete') throw new Error('Document coverage is not complete.');
    const coverageUnits = await ctx.db.query('documentSourceUnitCoverage')
      .withIndex('by_manifest_unit', (q) => q.eq('manifestId', manifest._id))
      .collect();
    const coverageVerification = verifyCompleteSourceCoverage({ manifest, units: coverageUnits });
    if (!coverageVerification.passed) {
      throw new Error(`Document coverage verification failed: ${coverageVerification.errors.join(', ')}.`);
    }
    const chunks = await ctx.db.query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', generation._id))
      .collect();
    if (chunks.length === 0) throw new Error('Document has no canonical chunks.');
    const priorRuns = await ctx.db.query('documentUnderstandingRuns')
      .withIndex('by_file_created', (q) => q.eq('uploadedFileId', file._id))
      .collect();
    const restartNumber = priorRuns.filter((candidate) => candidate.memoryGenerationId === generation._id).length;
    const now = Date.now();
    const stableJobId = `dur_${stableCapabilityHash({
      uploadedFileId: file._id,
      dataProvenance: file.dataProvenance ?? 'production',
      qaRunId: file.qaRunId,
      memoryGenerationId: generation._id,
      coverageManifestId: manifest._id,
      version: UNDERSTANDING_VERSION,
      restartNumber,
    }).slice(0, 28)}`;
    const runId = await ctx.db.insert('documentUnderstandingRuns', {
      uploadedFileId: file._id,
      dataProvenance: file.dataProvenance ?? 'production',
      qaRunId: file.qaRunId,
      memoryGenerationId: generation._id,
      coverageManifestId: manifest._id,
      clerkUserId: file.clerkUserId,
      status: 'queued',
      version: UNDERSTANDING_VERSION,
      model: UNDERSTANDING_MODEL,
      stableJobId,
      totalChunks: chunks.length,
      nextChunkIndex: 0,
      currentLevel: 0,
      nextNodeIndex: 0,
      mapBatchSize: MAP_CHUNKS,
      reduceBatchSize: REDUCE_NODES,
      resumeCount: 0,
      lastResumedByUserId: user._id,
      lastResumedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(file._id, {
      activeUnderstandingRunId: runId,
      activeUnderstandingRecordId: undefined,
      fullDocumentReviewStatus: 'building',
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, PROCESS_RUN_REFERENCE, { runId });
    return { runId, stableJobId, restartNumber };
  },
});

import OpenAI from 'openai';
import { v } from 'convex/values';
import { makeFunctionReference, type FunctionReference } from 'convex/server';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  renderVerifiedDocumentReview,
  verifyDocumentUnderstanding,
  type DocumentUnderstandingFinding,
  type DocumentUnderstandingPayload,
} from '../src/lib/nexx/documentUnderstanding';

const UNDERSTANDING_VERSION = 'dur_v1';
const UNDERSTANDING_MODEL = 'gpt-5.4';
const MAP_CHUNKS = 6;
const REDUCE_NODES = 6;
const MAX_OUTPUT_TOKENS = 12_000;
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
  | { kind: 'map'; run: Doc<'documentUnderstandingRuns'>; file: Doc<'uploadedFiles'>; chunks: Doc<'documentChunks'>[] }
  | { kind: 'reduce' | 'finalize'; run: Doc<'documentUnderstandingRuns'>; file: Doc<'uploadedFiles'>; nodes: Doc<'documentUnderstandingNodes'>[]; levelCount: number };

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

async function generateNode(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 110_000 });
  const response = await client.responses.create({
    model: UNDERSTANDING_MODEL,
    reasoning: { effort: 'high' },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: prompt,
    text: { format: DUR_SCHEMA },
  });
  if (!response.output_text?.trim()) throw new Error('Understanding provider returned no output.');
  return parsePayload(response.output_text);
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
    if (!generation.coverageManifestId) throw new Error('Document has no coverage manifest.');
    const manifest = await ctx.db.get(generation.coverageManifestId);
    if (!manifest || manifest.status !== 'complete') throw new Error('Document coverage is not complete.');
    const chunks = await ctx.db.query('documentChunks')
      .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', generation._id))
      .collect();
    if (chunks.length === 0) throw new Error('Document has no canonical chunks.');
    const now = Date.now();
    const runId = await ctx.db.insert('documentUnderstandingRuns', {
      uploadedFileId: file._id,
      memoryGenerationId: generation._id,
      coverageManifestId: manifest._id,
      uploadSessionId: args.uploadSessionId,
      processingLockId: args.processingLockId,
      uploadCompletionStatus: args.uploadCompletionStatus,
      uploadIndexingError: args.uploadIndexingError,
      clerkUserId: file.clerkUserId,
      status: 'queued',
      version: UNDERSTANDING_VERSION,
      model: UNDERSTANDING_MODEL,
      totalChunks: chunks.length,
      nextChunkIndex: 0,
      currentLevel: 0,
      nextNodeIndex: 0,
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
    return { runId };
  },
});

export const getWork = internalQuery({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || ['ready', 'partial', 'failed'].includes(run.status)) return null;
    const file = await ctx.db.get(run.uploadedFileId);
    if (!file || file.activeUnderstandingRunId !== run._id || file.activeMemoryGenerationId !== run.memoryGenerationId) return null;
    if (run.status === 'queued' || run.status === 'mapping') {
      const chunks = await ctx.db.query('documentChunks')
        .withIndex('by_generation_chunk', (q) => q.eq('memoryGenerationId', run.memoryGenerationId).gte('chunkIndex', run.nextChunkIndex))
        .take(MAP_CHUNKS);
      return { kind: 'map' as const, run, file, chunks };
    }
    const nodes = await ctx.db.query('documentUnderstandingNodes')
      .withIndex('by_run_level_node', (q) => q.eq('runId', run._id).eq('level', run.currentLevel).gte('nodeIndex', run.nextNodeIndex))
      .take(REDUCE_NODES);
    const levelCount = (await ctx.db.query('documentUnderstandingNodes')
      .withIndex('by_run_level_node', (q) => q.eq('runId', run._id).eq('level', run.currentLevel))
      .collect()).length;
    return { kind: levelCount === 1 ? 'finalize' as const : 'reduce' as const, run, file, nodes, levelCount };
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
    if (!run || run.status !== 'reducing') return false;
    const now = Date.now();
    const recordId = await ctx.db.insert('documentUnderstandingRecords', {
      runId: run._id,
      uploadedFileId: run.uploadedFileId,
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
      totalChunks: run.totalChunks,
      coveredChunks: args.sourceChunkIndexes.length,
      createdAt: now,
    });
    await ctx.db.patch(run._id, { status: 'ready', updatedAt: now, finishedAt: now });
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
  args: { runId: v.id('documentUnderstandingRuns'), errorCode: v.string(), errorMessage: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || ['ready', 'failed'].includes(run.status)) return false;
    const now = Date.now();
    await ctx.db.patch(run._id, { status: 'failed', errorCode: args.errorCode, errorMessage: args.errorMessage.slice(0, 2_000), updatedAt: now, finishedAt: now });
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

export const processRun = internalAction({
  args: { runId: v.id('documentUnderstandingRuns') },
  handler: async (ctx, args): Promise<Record<string, unknown> | null> => {
    try {
      const work = await ctx.runQuery(internal.documentUnderstanding.getWork, args) as UnderstandingWork | null;
      if (!work) return null;
      if (work.kind === 'map') {
        if (work.chunks.length === 0) throw new Error('Map phase ended without a complete chunk range.');
        const first = work.chunks[0];
        const last = work.chunks[work.chunks.length - 1];
        const source = work.chunks.map((chunk) =>
          `SOURCE_CHUNK_${chunk.chunkIndex} | ${pageCitation(chunk.pageStart, chunk.pageEnd)}\n${chunk.text}`).join('\n\n');
        const payload = await generateNode([
          'You are exhaustively reading one contiguous part of a legal document.',
          'Capture every operative provision, ruling, obligation, prohibition, deadline, amount, finding, party, date, signature, reservation, ambiguity, and important procedural statement in the supplied chunks.',
          'Do not infer facts that are not written. Every finding must include one or more exact SOURCE_CHUNK_n IDs and a short verbatim quote copied from one cited chunk.',
          'Use category names that will remain useful in a complete court-order review. Do not omit seemingly routine language.',
          source,
        ].join('\n\n'));
        await ctx.runMutation(internal.documentUnderstanding.persistNode, {
          runId: work.run._id, expectedStatus: 'mapping', level: 0,
          nodeIndex: Math.floor(first.chunkIndex / MAP_CHUNKS),
          sourceChunkStart: first.chunkIndex, sourceChunkEnd: last.chunkIndex,
          sourceChunkCount: work.chunks.length,
          pageStart: first.pageStart, pageEnd: last.pageEnd ?? last.pageStart,
          payloadJson: JSON.stringify(payload), nextChunkIndex: last.chunkIndex + 1,
        });
        return { phase: 'mapping', throughChunk: last.chunkIndex };
      }
      if (work.kind === 'reduce') {
        if (work.nodes.length === 0) throw new Error('Reduce phase found no nodes.');
        const first = work.nodes[0];
        const last = work.nodes[work.nodes.length - 1];
        const payload = await generateNode([
          'Merge these contiguous legal-document analyses without losing any distinct provision or source citation.',
          'Deduplicate only genuinely identical findings. Preserve exact SOURCE_CHUNK_n IDs and verbatim supporting quotes. Do not invent or broaden claims.',
          ...work.nodes.map((node, index) => `NODE_${index}\n${node.payloadJson}`),
        ].join('\n\n'));
        const consumed = first.nodeIndex + work.nodes.length;
        await ctx.runMutation(internal.documentUnderstanding.persistNode, {
          runId: work.run._id, expectedStatus: 'reducing', level: work.run.currentLevel + 1,
          nodeIndex: Math.floor(first.nodeIndex / REDUCE_NODES),
          sourceChunkStart: first.sourceChunkStart, sourceChunkEnd: last.sourceChunkEnd,
          sourceChunkCount: work.nodes.reduce((sum, node) => sum + node.sourceChunkCount, 0),
          pageStart: first.pageStart, pageEnd: last.pageEnd,
          payloadJson: JSON.stringify(payload), nextNodeIndex: consumed,
          finishLevel: consumed >= work.levelCount,
        });
        return { phase: 'reducing', level: work.run.currentLevel };
      }
      const root = work.nodes[0];
      const chunks = await ctx.runQuery(internal.documentUnderstanding.getAllChunks, { runId: work.run._id });
      if (!root) throw new Error('Understanding reduction produced no root node.');
      const payload = parsePayload(root.payloadJson);
      const verification = verifyDocumentUnderstanding({ payload, chunks, provenance: root });
      if (!verification.passed) throw new Error(verification.errors.join(' | '));
      const sourceChunkIndexes = chunks.map((chunk) => chunk.chunkIndex);
      await ctx.runMutation(internal.documentUnderstanding.finalizeRun, {
        runId: work.run._id,
        structuredJson: JSON.stringify(payload),
        renderedReviewMarkdown: renderVerifiedDocumentReview({ filename: work.file.filename, payload, chunks }),
        sourceChunkIds: chunks.map((chunk) => chunk._id),
        sourceChunkIndexes,
        checks: ['coverage_manifest_complete', ...verification.checks],
      });
      return { phase: 'ready', chunks: chunks.length, findings: payload.findings.length };
    } catch (error) {
      await ctx.runMutation(internal.documentUnderstanding.failRun, {
        runId: args.runId,
        errorCode: 'understanding_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { phase: 'failed' };
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

export const getActiveRecord = internalQuery({
  args: { uploadedFileId: v.id('uploadedFiles') },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.uploadedFileId);
    if (!file?.activeUnderstandingRecordId || file.fullDocumentReviewStatus !== 'ready') return null;
    const record = await ctx.db.get(file.activeUnderstandingRecordId);
    if (!record || record.memoryGenerationId !== file.activeMemoryGenerationId || record.verificationStatus !== 'verified') return null;
    return record;
  },
});

import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { understandTurn } from '../src/lib/nexx/orchestration/turnUnderstanding';
import { decideFocusTransition } from '../src/lib/nexx/orchestration/focusTransition';
import { buildCapabilitySnapshot, canPerformOperation } from '../src/lib/nexx/capabilities/documentCapabilityLedger';
import type { ConversationControlSnapshot } from '../src/lib/nexx/orchestration/types';

const REQUIRED_INVARIANTS = [
  'INV-FOCUS-001',
  'INV-FOCUS-002',
  'INV-CAP-001',
  'INV-CAP-002',
  'INV-PUB-001',
] as const;

export const runExecutiveChatCanary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const startedAt = Date.now();
    const runId = await ctx.db.insert('chatQualityCanaryRuns', {
      scenarioId: 'analyze-which-please-do-so',
      status: 'running',
      invariantCodes: [...REQUIRED_INVARIANTS],
      failedInvariantCodes: [],
      phase: 'understanding',
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    const failed: string[] = [];
    try {
      const control: ConversationControlSnapshot = {
        schemaVersion: 1,
        focusRevision: 4,
        activeTaskId: 'synthetic-document-review',
        activeTaskKind: 'document_review',
        activeDocumentIds: ['synthetic-signed-order'],
        activeEvidenceGenerationIds: [],
        pendingAct: 'confirm',
        pendingOptions: [],
        lastAssistantOffer: {
          act: 'confirm',
          object: 'perform the focused review',
          targetTaskId: 'synthetic-document-review',
          documentIds: ['synthetic-signed-order'],
        },
        confidence: 1,
        provenance: 'native_v1',
      };
      const which = understandTurn({ message: 'which', controlState: control });
      const whichTransition = decideFocusTransition({ message: 'which', understanding: which, controlState: control });
      if (whichTransition.kind === 'replace') failed.push('INV-FOCUS-001', 'INV-FOCUS-002');
      const confirm = understandTurn({ message: 'please do so', controlState: control });
      const confirmTransition = decideFocusTransition({ message: 'please do so', understanding: confirm, controlState: control });
      if (confirmTransition.kind !== 'refine') failed.push('INV-FOCUS-001');

      await ctx.db.patch(runId, { phase: 'capability', updatedAt: Date.now() });
      const snapshot = buildCapabilitySnapshot({
        turnId: 'synthetic-turn',
        documents: [{
          uploadedFileId: 'synthetic-signed-order',
          filename: 'Synthetic Signed Order.pdf',
          status: 'ready',
          authorized: true,
          extractedTextLength: 100_000,
          chunkCount: 30,
          hasKeywordSearch: true,
          hasCitationAnchors: true,
          availablePageRanges: [[1, 46]],
          coverageStatus: 'complete',
          fullDocumentReviewStatus: 'failed',
        }],
      });
      const focused = canPerformOperation('answer_focused_question', snapshot);
      const exhaustive = canPerformOperation('exhaustive_review', snapshot);
      if (!focused.allowed || exhaustive.allowed) failed.push('INV-CAP-001');
      if (!focused.prohibitedClaims.includes('file_unreadable')) failed.push('INV-CAP-002');

      const uniqueFailed = Array.from(new Set(failed));
      const finishedAt = Date.now();
      await ctx.db.patch(runId, {
        status: uniqueFailed.length > 0 ? 'failed' : 'succeeded',
        failedInvariantCodes: uniqueFailed,
        phase: 'complete',
        errorCode: uniqueFailed.length > 0 ? 'executive_chat_canary_invariant_failed' : undefined,
        latencyMs: finishedAt - startedAt,
        finishedAt,
        updatedAt: finishedAt,
      });
      return { runId, succeeded: uniqueFailed.length === 0, failedInvariantCodes: uniqueFailed };
    } catch (error) {
      const finishedAt = Date.now();
      await ctx.db.patch(runId, {
        status: 'failed',
        failedInvariantCodes: [...REQUIRED_INVARIANTS],
        phase: 'complete',
        errorCode: error instanceof Error ? error.message.slice(0, 200) : 'executive_chat_canary_failed',
        latencyMs: finishedAt - startedAt,
        finishedAt,
        updatedAt: finishedAt,
      });
      return { runId, succeeded: false, failedInvariantCodes: [...REQUIRED_INVARIANTS] };
    }
  },
});

export const auditExecutiveChatCanary = internalMutation({
  args: { maxAgeMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const maxAgeMs = Math.max(5 * 60_000, args.maxAgeMs ?? 30 * 60_000);
    const latest = await ctx.db.query('chatQualityCanaryRuns')
      .withIndex('by_scenario_created', (q) => q.eq('scenarioId', 'analyze-which-please-do-so'))
      .order('desc')
      .first();
    const stale = !latest || Date.now() - latest.createdAt > maxAgeMs;
    const healthy = Boolean(latest && latest.status === 'succeeded' && !stale);
    if (!healthy) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'executive_chat_canary_unhealthy',
        runId: latest?._id,
        status: latest?.status ?? 'missing',
        stale,
        failedInvariantCodes: latest?.failedInvariantCodes ?? REQUIRED_INVARIANTS,
      }));
    }
    return { healthy, stale, runId: latest?._id ?? null, failedInvariantCodes: latest?.failedInvariantCodes ?? [] };
  },
});

export const cleanupOldRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = await ctx.db.query('chatQualityCanaryRuns')
      .withIndex('by_status_created', (q) => q.eq('status', 'succeeded').lt('createdAt', cutoff))
      .take(250);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 250) await ctx.scheduler.runAfter(0, internal.chatQualityCanary.cleanupOldRuns, {});
    return { deleted: rows.length };
  },
});


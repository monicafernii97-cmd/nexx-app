import { v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { isUploadE2ERobotEmail } from './lib/chatRateLimitPolicy';
import { isProductionEligibleDocument, qaRunIdFromFilename } from './lib/qaProvenance';
import {
  canonicalizeDocumentCandidates,
  classifyRepairCandidate,
  containsAnyTarget,
  documentIdsForDerivedRepair,
  findDerivedDocumentReferences,
  stableRepairHash,
  withoutTargets,
} from '../src/lib/nexx/qaStateRepair';

const MAX_AUDIT_BATCH = 25;
const MAX_APPROVED_TARGETS = 20;
const MAX_SNAPSHOT_BATCH = 50;
const MAX_DERIVED_GRAPH_CONVERSATIONS = 100;
const REPAIR_CONFIRMATION = 'AUTHORIZE_QA_QUARANTINE';
const DERIVED_REPAIR_CONFIRMATION = 'AUTHORIZE_DERIVED_STATE_REPAIR';
const RESTORE_CONFIRMATION = 'AUTHORIZE_CONFLICT_SAFE_RESTORE';
const ADJUDICATION_CONFIRMATION = 'ATTEST_LEGACY_FIXTURE_EVIDENCE';

type SnapshotTable =
  | 'uploadedFiles'
  | 'conversations'
  | 'conversationDocumentState'
  | 'conversationControlStates'
  | 'conversationTasks'
  | 'turnExecutionPlans'
  | 'conversationLegalIssueState';

type JsonFields = Record<string, unknown>;

function bounded(value: number | undefined, fallback: number, maximum: number) {
  return Math.max(1, Math.min(maximum, Math.floor(value ?? fallback)));
}

function normalizeFields(fields: JsonFields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value ?? null]));
}

function decodePatch(json: string) {
  const parsed = JSON.parse(json) as JsonFields;
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === null ? undefined : value]));
}

function projectCurrent(record: object, beforeJson: string) {
  const before = JSON.parse(beforeJson) as JsonFields;
  const source = record as JsonFields;
  return normalizeFields(Object.fromEntries(Object.keys(before).map((key) => [key, source[key]])));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

async function insertEvent(
  ctx: MutationCtx,
  args: { repairRunId: string; eventType: string; detail: unknown; operatorId?: string; approvalId?: string },
) {
  await ctx.db.insert('productionStateRepairEvents', {
    repairRunId: args.repairRunId,
    eventType: args.eventType,
    operatorId: args.operatorId,
    approvalId: args.approvalId,
    detailJson: JSON.stringify(args.detail),
    createdAt: Date.now(),
  });
}

async function referenceSummary(ctx: MutationCtx, file: Doc<'uploadedFiles'>) {
  const categories: string[] = [];
  const counts: Record<string, number> = {};
  const add = (category: string, count: number) => {
    if (count <= 0) return;
    categories.push(category);
    counts[category] = count;
  };

  const generations = await ctx.db.query('documentMemoryGenerations')
    .withIndex('by_file_generation', (q) => q.eq('uploadedFileId', file._id))
    .collect();
  const chunks = await ctx.db.query('documentChunks')
    .withIndex('by_uploaded_file_chunk', (q) => q.eq('uploadedFileId', file._id))
    .collect();
  const understandingRuns = await ctx.db.query('documentUnderstandingRuns')
    .withIndex('by_file_created', (q) => q.eq('uploadedFileId', file._id))
    .collect();
  add('memory_generations', generations.length);
  add('memory_chunks', chunks.length);
  add('exhaustive_review_jobs', understandingRuns.length);

  if (file.conversationId) {
    const [attachments, documentState, controlState, tasks, plans, issues, retrievals, evidence] = await Promise.all([
      ctx.db.query('messageAttachments').withIndex('by_conversation', (q) => q.eq('conversationId', file.conversationId!)).collect(),
      ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', file.conversationId!)).first(),
      ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', file.conversationId!)).first(),
      ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', file.conversationId!)).collect(),
      ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', file.conversationId!)).collect(),
      ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', file.conversationId!)).collect(),
      ctx.db.query('documentRetrievalAudit').withIndex('by_conversation', (q) => q.eq('conversationId', file.conversationId!)).collect(),
      ctx.db.query('documentAnswerEvidence').withIndex('by_conversation_created', (q) => q.eq('conversationId', file.conversationId!)).collect(),
    ]);
    const target = file._id.toString();
    add('message_attachments', attachments.filter((row) => row.uploadedFileId === file._id).length);
    add('active_or_remembered_state', documentState && [
      documentState.activeUploadedFileId?.toString(),
      ...documentState.lastReferencedUploadedFileIds.map(String),
      ...documentState.pinnedUploadedFileIds.map(String),
    ].includes(target) ? 1 : 0);
    add('conversation_control', controlState && (
      controlState.activeDocumentIds.map(String).includes(target) ||
      containsAnyTarget(controlState.pendingOptionsJson, new Set([target])) ||
      containsAnyTarget(controlState.lastResolvedReferentsJson, new Set([target]))
    ) ? 1 : 0);
    add('conversation_tasks', tasks.filter((row) => row.documentIds.map(String).includes(target)).length);
    add('turn_execution_plans', plans.filter((row) => row.selectedDocumentIds.map(String).includes(target)).length);
    add('legal_issue_anchors', issues.filter((row) => row.sourceAnchors.some((anchor) => anchor.uploadedFileId === file._id)).length);
    add('retrieval_audits', retrievals.filter((row) =>
      [...row.candidateUploadedFileIds, ...row.selectedUploadedFileIds].map(String).includes(target)
    ).length);
    add('answer_evidence', evidence.filter((row) => row.usedUploadedFileIds.map(String).includes(target)).length);
  }
  return { categories: uniqueStrings(categories), counts, generationIds: generations.map((row) => row._id.toString()) };
}

async function getRun(ctx: MutationCtx, repairRunId: string) {
  const run = await ctx.db.query('productionStateRepairRuns')
    .withIndex('by_repair_run', (q) => q.eq('repairRunId', repairRunId))
    .unique();
  if (!run) throw new Error('Repair run not found');
  return run;
}

export const startAudit = internalMutation({
  args: {
    repairRunId: v.string(),
    codeVersion: v.string(),
    scopeConversationId: v.optional(v.id('conversations')),
    scopeCaseId: v.optional(v.id('cases')),
    operatorId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('productionStateRepairRuns')
      .withIndex('by_repair_run', (q) => q.eq('repairRunId', args.repairRunId))
      .unique();
    if (existing) {
      if (
        existing.codeVersion !== args.codeVersion ||
        existing.scopeConversationId !== args.scopeConversationId ||
        existing.scopeCaseId !== args.scopeCaseId ||
        existing.operatorId !== args.operatorId
      ) throw new Error('Repair run ID already exists with different immutable inputs');
      return existing._id;
    }
    const now = Date.now();
    const runId = await ctx.db.insert('productionStateRepairRuns', {
      repairRunId: args.repairRunId,
      codeVersion: args.codeVersion,
      scopeConversationId: args.scopeConversationId,
      scopeCaseId: args.scopeCaseId,
      status: 'auditing',
      auditComplete: false,
      scannedCount: 0,
      candidateCount: 0,
      unclassifiedCount: 0,
      approvedTargetUploadedFileIds: [],
      operatorId: args.operatorId,
      createdAt: now,
      updatedAt: now,
    });
    await insertEvent(ctx, { repairRunId: args.repairRunId, eventType: 'audit_started', operatorId: args.operatorId, detail: args });
    return runId;
  },
});

export const auditUploadedFilesBatch = internalMutation({
  args: { repairRunId: v.string(), cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status !== 'auditing') throw new Error(`Repair run is not auditing (${run.status})`);
    if (args.cursor !== undefined && args.cursor !== run.auditCursor) {
      throw new Error('Audit cursor is stale or does not belong to this run');
    }
    const page = await ctx.db.query('uploadedFiles').paginate({
      cursor: args.cursor ?? run.auditCursor ?? null,
      numItems: bounded(args.batchSize, 10, MAX_AUDIT_BATCH),
    });
    let candidateCount = 0;
    let unclassifiedCount = 0;
    for (const file of page.page) {
      if (run.scopeConversationId && file.conversationId !== run.scopeConversationId) continue;
      if (run.scopeCaseId && file.caseId !== run.scopeCaseId) continue;
      const creator = await ctx.db.query('users')
        .withIndex('by_clerk', (q) => q.eq('clerkId', file.clerkUserId))
        .first();
      const session = file.uploadSessionId ? await ctx.db.get(file.uploadSessionId) : null;
      const classification = classifyRepairCandidate({
        dataProvenance: file.dataProvenance,
        creatorIsRobot: isUploadE2ERobotEmail(creator?.email),
        filenameHasSyntheticPrefix: Boolean(qaRunIdFromFilename(file.filename)),
        qaRunId: file.qaRunId ?? session?.qaRunId,
        sessionDataProvenance: session?.dataProvenance,
      });
      if (classification.classification === 'production') continue;
      const existing = await ctx.db.query('productionStateRepairItems')
        .withIndex('by_run_file', (q) => q.eq('repairRunId', args.repairRunId).eq('uploadedFileId', file._id))
        .unique();
      const refs = await referenceSummary(ctx, file);
      const now = Date.now();
      const item = {
        conversationId: file.conversationId,
        caseId: file.caseId,
        classification: classification.classification,
        confidence: classification.confidence,
        discoveryReasons: classification.reasons,
        referenceCategories: refs.categories,
        referenceSummaryJson: JSON.stringify(refs),
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, item);
      else await ctx.db.insert('productionStateRepairItems', {
        repairRunId: args.repairRunId,
        uploadedFileId: file._id,
        ...item,
        selectedForRepair: false,
        createdAt: now,
      });
      if (classification.classification === 'unclassified') unclassifiedCount += 1;
      else candidateCount += 1;
    }
    const now = Date.now();
    await ctx.db.patch(run._id, {
      auditCursor: page.isDone ? undefined : page.continueCursor,
      auditComplete: page.isDone,
      status: page.isDone ? 'awaiting_approval' : 'auditing',
      scannedCount: run.scannedCount + page.page.length,
      candidateCount: run.candidateCount + candidateCount,
      unclassifiedCount: run.unclassifiedCount + unclassifiedCount,
      updatedAt: now,
    });
    if (page.isDone) {
      await insertEvent(ctx, {
        repairRunId: args.repairRunId,
        eventType: 'audit_completed',
        operatorId: run.operatorId,
        detail: { scannedCount: run.scannedCount + page.page.length, candidateCount: run.candidateCount + candidateCount, unclassifiedCount: run.unclassifiedCount + unclassifiedCount },
      });
    }
    return { isDone: page.isDone, continueCursor: page.continueCursor, scanned: page.page.length, candidateCount, unclassifiedCount };
  },
});

export const getAuditReport = internalQuery({
  args: { repairRunId: v.string(), cursor: v.optional(v.string()), pageSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.query('productionStateRepairRuns')
      .withIndex('by_repair_run', (q) => q.eq('repairRunId', args.repairRunId)).unique();
    if (!run) return null;
    const items = await ctx.db.query('productionStateRepairItems')
      .withIndex('by_run_selected', (q) => q.eq('repairRunId', args.repairRunId))
      .paginate({ cursor: args.cursor ?? null, numItems: bounded(args.pageSize, 50, 100) });
    return { run, items };
  },
});

export const adjudicateLegacyFixture = internalMutation({
  args: {
    repairRunId: v.string(),
    uploadedFileId: v.id('uploadedFiles'),
    operatorId: v.string(),
    approvalId: v.string(),
    evidenceSummary: v.string(),
    confirmation: v.literal(ADJUDICATION_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status !== 'awaiting_approval') throw new Error(`Repair run cannot be adjudicated from ${run.status}`);
    if (!args.operatorId.trim() || !args.approvalId.trim() || args.evidenceSummary.trim().length < 12) {
      throw new Error('Operator identity, approval ID, and a meaningful evidence summary are required');
    }
    const [file, item] = await Promise.all([
      ctx.db.get(args.uploadedFileId),
      ctx.db.query('productionStateRepairItems')
        .withIndex('by_run_file', (q) => q.eq('repairRunId', args.repairRunId).eq('uploadedFileId', args.uploadedFileId))
        .unique(),
    ]);
    if (!file || !item || item.classification !== 'unclassified') {
      throw new Error('Only an unclassified audit item can be adjudicated');
    }
    if (file.dataProvenance === 'production') {
      throw new Error('Explicit production provenance requires manual incident escalation');
    }

    const evidence: string[] = [];
    if (/^synthetic[-_].+\.(pdf|docx?|txt)$/i.test(file.filename.trim())) evidence.push('synthetic_fixture_filename');
    if (file.storageSha256) {
      const sameHash = await ctx.db.query('uploadedFiles')
        .withIndex('by_clerk_storage_hash', (q) => q.eq('clerkUserId', file.clerkUserId).eq('storageSha256', file.storageSha256!))
        .take(10);
      if (sameHash.length >= 2) evidence.push('repeated_fixture_hash');
    }
    if (file.conversationId) {
      const [conversation, messages] = await Promise.all([
        ctx.db.get(file.conversationId),
        ctx.db.query('messages').withIndex('by_conversation', (q) => q.eq('conversationId', file.conversationId!)).take(25),
      ]);
      if (conversation && /synthetic|test fixture/i.test(conversation.title)) evidence.push('test_conversation_title');
      if (messages.some((message) => /synthetic test|not a real case|test (?:court )?order/i.test(message.content))) {
        evidence.push('explicit_test_message');
      }
    }
    const corroborated = evidence.length >= 2 &&
      (evidence.includes('repeated_fixture_hash') || evidence.includes('explicit_test_message'));
    if (!corroborated) {
      throw new Error('Legacy fixture evidence is not sufficiently corroborated for high-confidence classification');
    }

    const now = Date.now();
    await ctx.db.patch(item._id, {
      classification: 'confirmed_synthetic',
      confidence: 'high',
      discoveryReasons: uniqueStrings([...item.discoveryReasons, ...evidence, 'operator_evidence_adjudication']),
      adjudicatedBy: args.operatorId,
      adjudicationApprovalId: args.approvalId,
      adjudicatedAt: now,
      adjudicationEvidenceJson: JSON.stringify({ evidence, summary: args.evidenceSummary.trim().slice(0, 500) }),
      updatedAt: now,
    });
    await ctx.db.patch(run._id, {
      candidateCount: run.candidateCount + 1,
      unclassifiedCount: Math.max(0, run.unclassifiedCount - 1),
      updatedAt: now,
    });
    await insertEvent(ctx, {
      repairRunId: args.repairRunId,
      eventType: 'legacy_fixture_adjudicated',
      operatorId: args.operatorId,
      approvalId: args.approvalId,
      detail: { uploadedFileId: args.uploadedFileId, evidence },
    });
    return { classification: 'confirmed_synthetic' as const, confidence: 'high' as const, evidence };
  },
});

export const authorizeRepair = internalMutation({
  args: {
    repairRunId: v.string(),
    uploadedFileIds: v.array(v.id('uploadedFiles')),
    operatorId: v.string(),
    approvalId: v.string(),
    approvedAt: v.number(),
    approvalReason: v.string(),
    confirmation: v.union(v.literal(REPAIR_CONFIRMATION), v.literal(DERIVED_REPAIR_CONFIRMATION)),
  },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status !== 'awaiting_approval') throw new Error(`Repair run is not awaiting approval (${run.status})`);
    if (!run.auditComplete) throw new Error('Audit is not complete');
    if (run.parentRepairRunId && args.confirmation !== DERIVED_REPAIR_CONFIRMATION) {
      throw new Error('Derived-state repair requires the derived-state confirmation phrase');
    }
    if (!run.parentRepairRunId && args.confirmation !== REPAIR_CONFIRMATION) {
      throw new Error('Quarantine repair requires the quarantine confirmation phrase');
    }
    if (!args.operatorId.trim() || !args.approvalId.trim() || !args.approvalReason.trim()) {
      throw new Error('Operator identity, approval ID, and approval reason are required');
    }
    const uniqueTargets = [...new Set(args.uploadedFileIds.map(String))].map((id) => id as Id<'uploadedFiles'>);
    if (uniqueTargets.length === 0 || uniqueTargets.length > MAX_APPROVED_TARGETS) {
      throw new Error(`Approve between 1 and ${MAX_APPROVED_TARGETS} targets per repair run`);
    }
    for (const uploadedFileId of uniqueTargets) {
      const item = await ctx.db.query('productionStateRepairItems')
        .withIndex('by_run_file', (q) => q.eq('repairRunId', args.repairRunId).eq('uploadedFileId', uploadedFileId))
        .unique();
      if (!item || item.confidence !== 'high' || item.classification === 'unclassified') {
        throw new Error(`Target ${uploadedFileId} lacks high-confidence non-filename evidence`);
      }
      await ctx.db.patch(item._id, { selectedForRepair: true, updatedAt: Date.now() });
    }
    await ctx.db.patch(run._id, {
      status: 'authorized',
      approvedTargetUploadedFileIds: uniqueTargets,
      operatorId: args.operatorId,
      approvalId: args.approvalId,
      approvedAt: args.approvedAt,
      approvalReason: args.approvalReason,
      updatedAt: Date.now(),
    });
    await insertEvent(ctx, { repairRunId: args.repairRunId, eventType: 'repair_authorized', operatorId: args.operatorId, approvalId: args.approvalId, detail: { targets: uniqueTargets, approvedAt: args.approvedAt, reason: args.approvalReason } });
    return { authorizedTargets: uniqueTargets.length };
  },
});

/** Read-only inventory of every remaining future-facing quarantined reference in an owner/case graph. */
export const inspectDerivedStateGraph = internalQuery({
  args: {
    parentRepairRunId: v.string(),
    scopeConversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    const [parent, scopeConversation] = await Promise.all([
      ctx.db.query('productionStateRepairRuns')
        .withIndex('by_repair_run', (q) => q.eq('repairRunId', args.parentRepairRunId))
        .unique(),
      ctx.db.get(args.scopeConversationId),
    ]);
    if (!parent || parent.status !== 'verified') throw new Error('Parent quarantine repair must be verified');
    if (!scopeConversation) throw new Error('Derived repair scope is missing');
    const targetIds = new Set(parent.approvedTargetUploadedFileIds.map(String));
    const conversations = await ctx.db.query('conversations')
      .withIndex('by_user_case', (q) => q.eq('userId', scopeConversation.userId).eq('caseId', scopeConversation.caseId))
      .take(MAX_DERIVED_GRAPH_CONVERSATIONS + 1);
    if (conversations.length > MAX_DERIVED_GRAPH_CONVERSATIONS) {
      throw new Error(`Derived-state graph exceeds ${MAX_DERIVED_GRAPH_CONVERSATIONS} conversations; use a bounded operator batch`);
    }

    const reports = [];
    for (const conversation of conversations) {
      const [documentState, controlState, tasks, plans, issues] = await Promise.all([
        ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id)).first(),
        ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id)).first(),
        ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', conversation._id)).collect(),
        ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', conversation._id)).collect(),
        ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', conversation._id)).collect(),
      ]);
      const generationIds = [...new Set([
        ...(controlState?.activeEvidenceGenerationIds ?? []).map(String),
        ...tasks.flatMap((task) => task.evidenceGenerationIds.map(String)),
      ])];
      const generations = await Promise.all(generationIds.map((id) => ctx.db.get(id as Id<'documentMemoryGenerations'>)));
      const records = [
        ...(documentState ? [{
          conversationId: conversation._id.toString(),
          category: 'conversation_document_state',
          documentIds: [
            ...(documentState.activeUploadedFileId ? [documentState.activeUploadedFileId.toString()] : []),
            ...documentState.lastReferencedUploadedFileIds.map(String),
            ...documentState.pinnedUploadedFileIds.map(String),
          ],
        }] : []),
        ...(controlState ? [{
          conversationId: conversation._id.toString(),
          category: 'conversation_control',
          documentIds: controlState.activeDocumentIds.map(String),
          serializedState: [
            controlState.pendingOptionsJson,
            controlState.lastAssistantOfferJson,
            controlState.lastResolvedReferentsJson,
          ].filter(Boolean).join('\n'),
        }] : []),
        ...tasks.map((task) => ({ conversationId: conversation._id.toString(), category: 'conversation_task', documentIds: task.documentIds.map(String) })),
        ...generations.filter((generation) => Boolean(generation)).map((generation) => ({
          conversationId: conversation._id.toString(),
          category: 'evidence_generation',
          documentIds: [generation!.uploadedFileId.toString()],
        })),
        ...plans.map((plan) => ({ conversationId: conversation._id.toString(), category: 'turn_execution_plan', documentIds: plan.selectedDocumentIds.map(String) })),
        ...issues.map((issue) => ({
          conversationId: conversation._id.toString(),
          category: 'legal_issue_anchor',
          documentIds: issue.sourceAnchors.map((anchor) => anchor.uploadedFileId.toString()),
        })),
      ];
      const matches = findDerivedDocumentReferences(records, targetIds);
      if (matches.length === 0) continue;
      reports.push({
        conversationId: conversation._id,
        title: conversation.title,
        isRequestedScope: conversation._id === args.scopeConversationId,
        categories: [...new Set(matches.map((match) => match.category))],
        matchedUploadedFileIds: [...targetIds].filter((targetId) => matches.some((match) =>
          match.documentIds?.includes(targetId) || match.serializedState?.includes(targetId)
        )),
      });
    }

    return {
      parentRepairRunId: args.parentRepairRunId,
      requestedScopeConversationId: args.scopeConversationId,
      targetUploadedFileIds: [...targetIds],
      affectedConversationCount: reports.length,
      outsideRequestedScopeCount: reports.filter((report) => !report.isRequestedScope).length,
      conversations: reports,
    };
  },
});

/**
 * Create an approval-gated repair run for references that escaped an earlier
 * quarantine because they lived in another conversation in the same case.
 * Genuine duplicate files are never repair targets and are not mutated.
 */
export const startDerivedStateAudit = internalMutation({
  args: {
    repairRunId: v.string(),
    parentRepairRunId: v.string(),
    scopeConversationId: v.id('conversations'),
    canonicalUploadedFileId: v.id('uploadedFiles'),
    duplicateUploadedFileIds: v.array(v.id('uploadedFiles')),
    clearPendingInteraction: v.boolean(),
    codeVersion: v.string(),
    operatorId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('productionStateRepairRuns')
      .withIndex('by_repair_run', (q) => q.eq('repairRunId', args.repairRunId))
      .unique();
    if (existing) {
      const duplicateIds = [...new Set(args.duplicateUploadedFileIds.map(String))].sort();
      const existingDuplicateIds = [...(existing.duplicateUploadedFileIds ?? []).map(String)].sort();
      if (
        existing.parentRepairRunId !== args.parentRepairRunId ||
        existing.scopeConversationId !== args.scopeConversationId ||
        existing.canonicalUploadedFileId !== args.canonicalUploadedFileId ||
        JSON.stringify(existingDuplicateIds) !== JSON.stringify(duplicateIds) ||
        existing.clearPendingInteraction !== args.clearPendingInteraction ||
        existing.codeVersion !== args.codeVersion ||
        existing.operatorId !== args.operatorId
      ) throw new Error('Derived repair run ID already exists with different immutable inputs');
      return { created: false as const, run: existing };
    }
    if (!args.operatorId.trim() || !args.codeVersion.trim()) throw new Error('Operator identity and code version are required');

    const parent = await getRun(ctx, args.parentRepairRunId);
    if (parent.status !== 'verified') throw new Error('Parent quarantine repair must be verified');
    const uniqueDuplicateIds = [...new Set(args.duplicateUploadedFileIds.map(String))];
    const [conversation, canonical, duplicates] = await Promise.all([
      ctx.db.get(args.scopeConversationId),
      ctx.db.get(args.canonicalUploadedFileId),
      Promise.all(uniqueDuplicateIds.map((id) => ctx.db.get(id as Id<'uploadedFiles'>))),
    ]);
    if (!conversation || !canonical) throw new Error('Derived repair scope is missing');
    const owner = await ctx.db.get(conversation.userId);
    if (!owner?.clerkId || canonical.clerkUserId !== owner.clerkId) throw new Error('Canonical document is outside the conversation owner scope');
    if (!isProductionEligibleDocument(canonical)) {
      throw new Error('Canonical document is not eligible');
    }
    if (conversation.caseId && canonical.caseId && canonical.caseId !== conversation.caseId) {
      throw new Error('Canonical document is outside the conversation case');
    }
    if (uniqueDuplicateIds.includes(args.canonicalUploadedFileId.toString())) throw new Error('Canonical document cannot be its own duplicate');
    if (duplicates.some((file) =>
      !file ||
      file.clerkUserId !== owner.clerkId ||
      !isProductionEligibleDocument(file) ||
      (conversation.caseId && file.caseId && file.caseId !== conversation.caseId)
    )) throw new Error('A genuine duplicate is missing, ineligible, or outside scope');
    const duplicateSelection = canonicalizeDocumentCandidates([
      {
        uploadedFileId: canonical._id.toString(),
        eligible: true,
        storageSha256: canonical.storageSha256,
        fullTextSha256: canonical.fullTextSha256,
        sha256Hash: canonical.sha256Hash,
      },
      ...duplicates.map((file) => ({
        uploadedFileId: file!._id.toString(),
        eligible: true,
        storageSha256: file!.storageSha256,
        fullTextSha256: file!.fullTextSha256,
        sha256Hash: file!.sha256Hash,
      })),
    ]);
    if (
      duplicateSelection.selectedDocumentIds.length !== 1 ||
      duplicateSelection.selectedDocumentIds[0] !== canonical._id.toString() ||
      duplicateSelection.rejected.length !== uniqueDuplicateIds.length ||
      duplicateSelection.rejected.some((item) => item.reason !== 'exact_duplicate')
    ) throw new Error('Every duplicate must share an exact stored fingerprint with the canonical document');

    const parentItems = await ctx.db.query('productionStateRepairItems')
      .withIndex('by_run_selected', (q) => q.eq('repairRunId', args.parentRepairRunId).eq('selectedForRepair', true))
      .collect();
    if (parentItems.length === 0 || parentItems.length !== parent.approvedTargetUploadedFileIds.length) {
      throw new Error('Parent repair target ledger is incomplete');
    }
    const targetIdSet = new Set(parent.approvedTargetUploadedFileIds.map(String));
    const graphConversations = await ctx.db.query('conversations')
      .withIndex('by_user_case', (q) => q.eq('userId', conversation.userId).eq('caseId', conversation.caseId))
      .take(MAX_DERIVED_GRAPH_CONVERSATIONS + 1);
    if (graphConversations.length > MAX_DERIVED_GRAPH_CONVERSATIONS) {
      throw new Error(`Derived-state graph exceeds ${MAX_DERIVED_GRAPH_CONVERSATIONS} conversations; use a bounded operator batch`);
    }
    const graphRecords = (await Promise.all(graphConversations.map(async (candidateConversation) => {
      const [documentState, controlState, tasks, plans, issues] = await Promise.all([
        ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', candidateConversation._id)).first(),
        ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', candidateConversation._id)).first(),
        ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', candidateConversation._id)).collect(),
        ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', candidateConversation._id)).collect(),
        ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', candidateConversation._id)).collect(),
      ]);
      const conversationId = candidateConversation._id.toString();
      return [
        ...(documentState ? [{
          conversationId,
          category: 'conversation_document_state',
          documentIds: [
            ...(documentState.activeUploadedFileId ? [documentState.activeUploadedFileId.toString()] : []),
            ...documentState.lastReferencedUploadedFileIds.map(String),
            ...documentState.pinnedUploadedFileIds.map(String),
          ],
        }] : []),
        ...(controlState ? [{
          conversationId,
          category: 'conversation_control',
          documentIds: controlState.activeDocumentIds.map(String),
          serializedState: [
            controlState.pendingOptionsJson,
            controlState.lastAssistantOfferJson,
            controlState.lastResolvedReferentsJson,
          ].filter(Boolean).join('\n'),
        }] : []),
        ...tasks.map((task) => ({ conversationId, category: 'conversation_task', documentIds: task.documentIds.map(String) })),
        ...plans.map((plan) => ({ conversationId, category: 'turn_execution_plan', documentIds: plan.selectedDocumentIds.map(String) })),
        ...issues.map((issue) => ({
          conversationId,
          category: 'legal_issue_anchor',
          documentIds: issue.sourceAnchors.map((anchor) => anchor.uploadedFileId.toString()),
        })),
      ];
    }))).flat();
    const graphMatches = findDerivedDocumentReferences(graphRecords, targetIdSet);
    const outsideScope = graphMatches.filter((match) => match.conversationId !== args.scopeConversationId.toString());
    if (outsideScope.length > 0) {
      throw new Error(`Quarantined references remain in ${new Set(outsideScope.map((match) => match.conversationId)).size} additional conversation(s); authorize a separately scoped repair before proceeding`);
    }
    const now = Date.now();
    await ctx.db.insert('productionStateRepairRuns', {
      repairRunId: args.repairRunId,
      parentRepairRunId: args.parentRepairRunId,
      codeVersion: args.codeVersion,
      scopeConversationId: args.scopeConversationId,
      scopeCaseId: conversation.caseId,
      canonicalUploadedFileId: args.canonicalUploadedFileId,
      duplicateUploadedFileIds: uniqueDuplicateIds.map((id) => id as Id<'uploadedFiles'>),
      clearPendingInteraction: args.clearPendingInteraction,
      status: 'awaiting_approval',
      auditComplete: true,
      scannedCount: parentItems.length,
      candidateCount: parentItems.length,
      unclassifiedCount: 0,
      approvedTargetUploadedFileIds: [],
      operatorId: args.operatorId,
      reportJson: JSON.stringify({
        parentRepairRunId: args.parentRepairRunId,
        conversationId: args.scopeConversationId,
        canonicalUploadedFileId: args.canonicalUploadedFileId,
        duplicateUploadedFileIds: uniqueDuplicateIds,
        quarantinedUploadedFileIds: parent.approvedTargetUploadedFileIds,
        derivedReferenceMatches: graphMatches.map((match) => ({
          conversationId: match.conversationId,
          category: match.category,
        })),
        clearPendingInteraction: args.clearPendingInteraction,
      }),
      createdAt: now,
      updatedAt: now,
    });
    for (const item of parentItems) {
      await ctx.db.insert('productionStateRepairItems', {
        repairRunId: args.repairRunId,
        uploadedFileId: item.uploadedFileId,
        conversationId: item.conversationId,
        caseId: item.caseId,
        classification: item.classification,
        confidence: item.confidence,
        discoveryReasons: uniqueStrings([...item.discoveryReasons, 'cross_conversation_derived_reference']),
        referenceCategories: item.referenceCategories,
        referenceSummaryJson: item.referenceSummaryJson,
        selectedForRepair: false,
        adjudicatedBy: item.adjudicatedBy,
        adjudicationApprovalId: item.adjudicationApprovalId,
        adjudicatedAt: item.adjudicatedAt,
        adjudicationEvidenceJson: item.adjudicationEvidenceJson,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertEvent(ctx, {
      repairRunId: args.repairRunId,
      eventType: 'derived_state_audit_completed',
      operatorId: args.operatorId,
      detail: {
        parentRepairRunId: args.parentRepairRunId,
        conversationId: args.scopeConversationId,
        canonicalUploadedFileId: args.canonicalUploadedFileId,
        duplicateCount: uniqueDuplicateIds.length,
        quarantinedTargetCount: parentItems.length,
        derivedReferenceMatchCount: graphMatches.length,
      },
    });
    return { created: true as const, repairRunId: args.repairRunId, targetCount: parentItems.length };
  },
});

/**
 * Create a separately authorized, cleanup-only run for one conversation that
 * still points at targets from a verified quarantine. This operation never
 * assigns a replacement document and never mutates upload rows.
 */
export const startQuarantinedReferenceCleanup = internalMutation({
  args: {
    repairRunId: v.string(),
    parentRepairRunId: v.string(),
    scopeConversationId: v.id('conversations'),
    clearPendingInteraction: v.boolean(),
    codeVersion: v.string(),
    operatorId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('productionStateRepairRuns')
      .withIndex('by_repair_run', (q) => q.eq('repairRunId', args.repairRunId))
      .unique();
    if (existing) {
      if (
        existing.parentRepairRunId !== args.parentRepairRunId ||
        existing.scopeConversationId !== args.scopeConversationId ||
        existing.canonicalUploadedFileId !== undefined ||
        (existing.duplicateUploadedFileIds ?? []).length !== 0 ||
        existing.clearPendingInteraction !== args.clearPendingInteraction ||
        existing.codeVersion !== args.codeVersion ||
        existing.operatorId !== args.operatorId
      ) throw new Error('Cleanup repair run ID already exists with different immutable inputs');
      return { created: false as const, run: existing };
    }
    if (!args.operatorId.trim() || !args.codeVersion.trim()) {
      throw new Error('Operator identity and code version are required');
    }

    const [parent, conversation] = await Promise.all([
      getRun(ctx, args.parentRepairRunId),
      ctx.db.get(args.scopeConversationId),
    ]);
    if (parent.status !== 'verified') throw new Error('Parent quarantine repair must be verified');
    if (!conversation) throw new Error('Cleanup conversation scope is missing');
    if (parent.scopeCaseId && conversation.caseId !== parent.scopeCaseId) {
      throw new Error('Cleanup conversation is outside the verified parent case scope');
    }
    const parentItems = await ctx.db.query('productionStateRepairItems')
      .withIndex('by_run_selected', (q) => q.eq('repairRunId', args.parentRepairRunId).eq('selectedForRepair', true))
      .collect();
    if (parentItems.length === 0 || parentItems.length !== parent.approvedTargetUploadedFileIds.length) {
      throw new Error('Parent repair target ledger is incomplete');
    }
    const targetIds = new Set(parent.approvedTargetUploadedFileIds.map(String));
    const [documentState, controlState, tasks, plans, issues] = await Promise.all([
      ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', args.scopeConversationId)).first(),
      ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', args.scopeConversationId)).first(),
      ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', args.scopeConversationId)).collect(),
      ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', args.scopeConversationId)).collect(),
      ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', args.scopeConversationId)).collect(),
    ]);
    const generationIds = [...new Set([
      ...(controlState?.activeEvidenceGenerationIds ?? []).map(String),
      ...tasks.flatMap((task) => task.evidenceGenerationIds.map(String)),
    ])];
    const generations = await Promise.all(generationIds.map((id) => ctx.db.get(id as Id<'documentMemoryGenerations'>)));
    const records = [
      ...(documentState ? [{
        conversationId: args.scopeConversationId.toString(),
        category: 'conversation_document_state',
        documentIds: [
          ...(documentState.activeUploadedFileId ? [documentState.activeUploadedFileId.toString()] : []),
          ...documentState.lastReferencedUploadedFileIds.map(String),
          ...documentState.pinnedUploadedFileIds.map(String),
        ],
      }] : []),
      ...(controlState ? [{
        conversationId: args.scopeConversationId.toString(),
        category: 'conversation_control',
        documentIds: controlState.activeDocumentIds.map(String),
        serializedState: [controlState.pendingOptionsJson, controlState.lastAssistantOfferJson, controlState.lastResolvedReferentsJson]
          .filter(Boolean).join('\n'),
      }] : []),
      ...tasks.map((task) => ({ conversationId: args.scopeConversationId.toString(), category: 'conversation_task', documentIds: task.documentIds.map(String) })),
      ...generations.filter((generation) => Boolean(generation)).map((generation) => ({
        conversationId: args.scopeConversationId.toString(),
        category: 'evidence_generation',
        documentIds: [generation!.uploadedFileId.toString()],
      })),
      ...plans.map((plan) => ({ conversationId: args.scopeConversationId.toString(), category: 'turn_execution_plan', documentIds: plan.selectedDocumentIds.map(String) })),
      ...issues.map((issue) => ({
        conversationId: args.scopeConversationId.toString(),
        category: 'legal_issue_anchor',
        documentIds: issue.sourceAnchors.map((anchor) => anchor.uploadedFileId.toString()),
      })),
    ];
    const matches = findDerivedDocumentReferences(records, targetIds);
    if (matches.length === 0) throw new Error('Cleanup scope contains no references to the verified quarantine targets');

    const now = Date.now();
    await ctx.db.insert('productionStateRepairRuns', {
      repairRunId: args.repairRunId,
      parentRepairRunId: args.parentRepairRunId,
      codeVersion: args.codeVersion,
      scopeConversationId: args.scopeConversationId,
      scopeCaseId: conversation.caseId,
      duplicateUploadedFileIds: [],
      clearPendingInteraction: args.clearPendingInteraction,
      status: 'awaiting_approval',
      auditComplete: true,
      scannedCount: parentItems.length,
      candidateCount: parentItems.length,
      unclassifiedCount: 0,
      approvedTargetUploadedFileIds: [],
      operatorId: args.operatorId,
      reportJson: JSON.stringify({
        mode: 'quarantined_reference_cleanup',
        parentRepairRunId: args.parentRepairRunId,
        conversationId: args.scopeConversationId,
        quarantinedUploadedFileIds: parent.approvedTargetUploadedFileIds,
        derivedReferenceMatches: matches.map((match) => ({ category: match.category })),
        clearPendingInteraction: args.clearPendingInteraction,
      }),
      createdAt: now,
      updatedAt: now,
    });
    for (const item of parentItems) {
      await ctx.db.insert('productionStateRepairItems', {
        repairRunId: args.repairRunId,
        uploadedFileId: item.uploadedFileId,
        conversationId: item.conversationId,
        caseId: item.caseId,
        classification: item.classification,
        confidence: item.confidence,
        discoveryReasons: uniqueStrings([...item.discoveryReasons, 'scoped_quarantined_reference_cleanup']),
        referenceCategories: item.referenceCategories,
        referenceSummaryJson: item.referenceSummaryJson,
        selectedForRepair: false,
        adjudicatedBy: item.adjudicatedBy,
        adjudicationApprovalId: item.adjudicationApprovalId,
        adjudicatedAt: item.adjudicatedAt,
        adjudicationEvidenceJson: item.adjudicationEvidenceJson,
        createdAt: now,
        updatedAt: now,
      });
    }
    await insertEvent(ctx, {
      repairRunId: args.repairRunId,
      eventType: 'quarantined_reference_cleanup_audit_completed',
      operatorId: args.operatorId,
      detail: {
        parentRepairRunId: args.parentRepairRunId,
        conversationId: args.scopeConversationId,
        matchCount: matches.length,
        targetCount: parentItems.length,
      },
    });
    return { created: true as const, repairRunId: args.repairRunId, targetCount: parentItems.length, matchCount: matches.length };
  },
});

async function snapshotRecord(
  ctx: MutationCtx,
  args: {
    repairRunId: string;
    sequence: number;
    targetTable: SnapshotTable;
    targetId: string;
    before: JsonFields;
    after: JsonFields;
    reasons: string[];
  },
) {
  const before = normalizeFields(args.before);
  const after = normalizeFields(args.after);
  if (stableRepairHash(before) === stableRepairHash(after)) return false;
  const existing = await ctx.db.query('productionStateRepairSnapshots')
    .withIndex('by_run_target', (q) => q.eq('repairRunId', args.repairRunId).eq('targetTable', args.targetTable).eq('targetId', args.targetId))
    .unique();
  if (existing) return false;
  const now = Date.now();
  await ctx.db.insert('productionStateRepairSnapshots', {
    repairRunId: args.repairRunId,
    sequence: args.sequence,
    targetTable: args.targetTable,
    targetId: args.targetId,
    beforeJson: JSON.stringify(before),
    intendedAfterJson: JSON.stringify(after),
    beforeHash: stableRepairHash(before),
    intendedAfterHash: stableRepairHash(after),
    discoveryReasons: args.reasons,
    confidence: 'high',
    state: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

function referencesAny(values: Array<Id<'uploadedFiles'>>, ids: ReadonlySet<string>) {
  return values.some((value) => ids.has(value.toString()));
}

/** Snapshot only derived state for a linked, authorized repair. */
export const snapshotAuthorizedDerivedRepair = internalMutation({
  args: { repairRunId: v.string() },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (!run.parentRepairRunId || !run.scopeConversationId) {
      throw new Error('Repair run is not a derived-state repair');
    }
    if (run.status === 'snapshotted') {
      const rows = await ctx.db.query('productionStateRepairSnapshots')
        .withIndex('by_run_sequence', (q) => q.eq('repairRunId', args.repairRunId))
        .collect();
      return { idempotent: true as const, snapshotCount: rows.length };
    }
    if (run.status !== 'authorized') throw new Error(`Repair run is not authorized (${run.status})`);
    const parent = await getRun(ctx, run.parentRepairRunId);
    if (parent.status !== 'verified') throw new Error('Parent quarantine repair is no longer verified');
    const targetIds = new Set(run.approvedTargetUploadedFileIds.map(String));
    if (targetIds.size !== parent.approvedTargetUploadedFileIds.length ||
        parent.approvedTargetUploadedFileIds.some((id) => !targetIds.has(id.toString()))) {
      throw new Error('Derived repair targets do not match the verified parent repair');
    }
    const duplicateIds = new Set((run.duplicateUploadedFileIds ?? []).map(String));
    const removedIds = new Set([...targetIds, ...duplicateIds]);
    const canonicalId = run.canonicalUploadedFileId?.toString();
    const [conversation, canonical, targetFiles, duplicateFiles] = await Promise.all([
      ctx.db.get(run.scopeConversationId),
      run.canonicalUploadedFileId ? ctx.db.get(run.canonicalUploadedFileId) : Promise.resolve(null),
      Promise.all(run.approvedTargetUploadedFileIds.map((id) => ctx.db.get(id))),
      Promise.all((run.duplicateUploadedFileIds ?? []).map((id) => ctx.db.get(id))),
    ]);
    if (!conversation || (run.canonicalUploadedFileId && !canonical)) throw new Error('Derived repair scope no longer exists');
    const owner = await ctx.db.get(conversation.userId);
    if (!owner?.clerkId) throw new Error('Derived repair owner no longer exists');
    if (canonical && (canonical.clerkUserId !== owner.clerkId || canonical.status === 'quarantined' || canonical.status === 'deleted')) {
      throw new Error('Canonical document changed or left owner scope');
    }
    if (targetFiles.some((file) => !file || file.status !== 'quarantined')) throw new Error('A parent repair target is no longer quarantined');
    if (duplicateFiles.some((file) => !file || file.clerkUserId !== owner.clerkId || file.status === 'quarantined' || file.status === 'deleted')) {
      throw new Error('A genuine duplicate changed or left owner scope');
    }

    const removedGenerationIds = new Set<string>();
    for (const uploadedFileId of [...run.approvedTargetUploadedFileIds, ...(run.duplicateUploadedFileIds ?? [])]) {
      const generations = await ctx.db.query('documentMemoryGenerations')
        .withIndex('by_file_generation', (q) => q.eq('uploadedFileId', uploadedFileId))
        .collect();
      generations.forEach((generation) => removedGenerationIds.add(generation._id.toString()));
    }
    const canonicalGenerationId = canonical?.activeMemoryGenerationId?.toString();

    const [documentState, controlState, tasks, plans, issues] = await Promise.all([
      ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', run.scopeConversationId!)).first(),
      ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', run.scopeConversationId!)).first(),
      ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', run.scopeConversationId!)).collect(),
      ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', run.scopeConversationId!)).collect(),
      ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', run.scopeConversationId!)).collect(),
    ]);
    const repairAt = Date.now();
    const reasons = [
      'linked_verified_quarantine',
      'cross_conversation_reference_cleanup',
      ...(canonicalId ? ['canonical_active_document'] : ['cleanup_without_document_replacement']),
    ];
    let sequence = 0;

    if (documentState) {
      const before = {
        activeUploadedFileId: documentState.activeUploadedFileId,
        lastReferencedUploadedFileIds: documentState.lastReferencedUploadedFileIds,
        pinnedUploadedFileIds: documentState.pinnedUploadedFileIds,
        updatedAt: documentState.updatedAt,
      };
      const activeWasRemoved = documentState.activeUploadedFileId
        ? removedIds.has(documentState.activeUploadedFileId.toString())
        : false;
      const repairedReferences = documentIdsForDerivedRepair({
        existingIds: documentState.lastReferencedUploadedFileIds.map(String),
        canonicalUploadedFileId: canonicalId,
        removedUploadedFileIds: removedIds,
      });
      const after = {
        ...before,
        activeUploadedFileId: run.canonicalUploadedFileId ?? (activeWasRemoved ? null : documentState.activeUploadedFileId),
        lastReferencedUploadedFileIds: repairedReferences,
        pinnedUploadedFileIds: documentState.pinnedUploadedFileIds.filter((id) => !removedIds.has(id.toString())),
        updatedAt: repairAt,
      };
      if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationDocumentState', targetId: documentState._id.toString(), before, after, reasons })) sequence += 1;
    }

    if (controlState) {
      const pendingAffected = run.clearPendingInteraction ||
        containsAnyTarget(controlState.pendingOptionsJson, removedIds) ||
        containsAnyTarget(controlState.lastAssistantOfferJson, removedIds);
      const before = {
        focusRevision: controlState.focusRevision,
        activeDocumentIds: controlState.activeDocumentIds,
        pendingAct: controlState.pendingAct,
        pendingOptionsJson: controlState.pendingOptionsJson,
        pendingSourceTurnId: controlState.pendingSourceTurnId,
        lastAssistantOfferJson: controlState.lastAssistantOfferJson,
        lastResolvedReferentsJson: controlState.lastResolvedReferentsJson,
        activeTaskId: controlState.activeTaskId,
        activeTaskKind: controlState.activeTaskKind,
        activeEvidenceGenerationIds: controlState.activeEvidenceGenerationIds,
        confidence: controlState.confidence,
        provenance: controlState.provenance,
        updatedAt: controlState.updatedAt,
      };
      const repairedActiveDocuments = documentIdsForDerivedRepair({
        existingIds: controlState.activeDocumentIds.map(String),
        canonicalUploadedFileId: canonicalId,
        removedUploadedFileIds: removedIds,
      });
      const activeTaskLosesEveryDocument = tasks.some((task) =>
        task.taskId === controlState.activeTaskId &&
        task.documentIds.some((id) => removedIds.has(id.toString())) &&
        documentIdsForDerivedRepair({
          existingIds: task.documentIds.map(String),
          canonicalUploadedFileId: canonicalId,
          removedUploadedFileIds: removedIds,
        }).length === 0
      );
      const repairedEvidenceGenerations = documentIdsForDerivedRepair({
        existingIds: controlState.activeEvidenceGenerationIds.map(String),
        canonicalUploadedFileId: canonicalGenerationId,
        removedUploadedFileIds: removedGenerationIds,
      });
      const after = {
        ...before,
        focusRevision: controlState.focusRevision + 1,
        activeTaskId: activeTaskLosesEveryDocument ? null : controlState.activeTaskId,
        activeTaskKind: activeTaskLosesEveryDocument ? null : controlState.activeTaskKind,
        activeDocumentIds: repairedActiveDocuments,
        activeEvidenceGenerationIds: repairedEvidenceGenerations,
        pendingAct: pendingAffected ? null : controlState.pendingAct,
        pendingOptionsJson: pendingAffected ? '[]' : controlState.pendingOptionsJson,
        pendingSourceTurnId: pendingAffected ? null : controlState.pendingSourceTurnId,
        lastAssistantOfferJson: pendingAffected ? null : controlState.lastAssistantOfferJson,
        lastResolvedReferentsJson: containsAnyTarget(controlState.lastResolvedReferentsJson, removedIds) ? '[]' : controlState.lastResolvedReferentsJson,
        confidence: 1,
        provenance: 'recovered',
        updatedAt: repairAt,
      };
      if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationControlStates', targetId: controlState._id.toString(), before, after, reasons })) sequence += 1;
    }

    for (const task of tasks) {
      if (!referencesAny(task.documentIds, removedIds) &&
          !task.evidenceGenerationIds.some((id) => removedGenerationIds.has(id.toString()))) continue;
      const repairedDocumentIds = documentIdsForDerivedRepair({
        existingIds: task.documentIds.map(String),
        canonicalUploadedFileId: canonicalId,
        removedUploadedFileIds: removedIds,
      });
      const repairedGenerationIds = documentIdsForDerivedRepair({
        existingIds: task.evidenceGenerationIds.map(String),
        canonicalUploadedFileId: canonicalGenerationId,
        removedUploadedFileIds: removedGenerationIds,
      });
      const before = { documentIds: task.documentIds, evidenceGenerationIds: task.evidenceGenerationIds, status: task.status, updatedAt: task.updatedAt };
      const after = {
        ...before,
        documentIds: repairedDocumentIds,
        evidenceGenerationIds: repairedGenerationIds,
        status: repairedDocumentIds.length === 0 && (task.kind === 'document_review' || task.kind === 'document_question')
          ? 'abandoned'
          : task.status,
        updatedAt: repairAt,
      };
      if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationTasks', targetId: task._id.toString(), before, after, reasons })) sequence += 1;
    }
    for (const plan of plans) {
      if (!referencesAny(plan.selectedDocumentIds, removedIds)) continue;
      const repairedDocumentIds = documentIdsForDerivedRepair({
        existingIds: plan.selectedDocumentIds.map(String),
        canonicalUploadedFileId: canonicalId,
        removedUploadedFileIds: removedIds,
      });
      const before = { selectedDocumentIds: plan.selectedDocumentIds, status: plan.status, updatedAt: plan.updatedAt };
      const after = {
        ...before,
        selectedDocumentIds: repairedDocumentIds,
        status: repairedDocumentIds.length === 0 && (plan.status === 'planned' || plan.status === 'executing')
          ? 'failed_recoverable'
          : plan.status,
        updatedAt: repairAt,
      };
      if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'turnExecutionPlans', targetId: plan._id.toString(), before, after, reasons })) sequence += 1;
    }
    for (const issue of issues) {
      if (!issue.sourceAnchors.some((anchor) => removedIds.has(anchor.uploadedFileId.toString()))) continue;
      const before = { sourceAnchors: issue.sourceAnchors, status: issue.status, updatedAt: issue.updatedAt };
      const seen = new Set<string>();
      const sourceAnchors = issue.sourceAnchors.flatMap((anchor) => {
        if (targetIds.has(anchor.uploadedFileId.toString())) return [];
        if (duplicateIds.has(anchor.uploadedFileId.toString()) && !run.canonicalUploadedFileId) return [];
        const uploadedFileId = duplicateIds.has(anchor.uploadedFileId.toString()) ? run.canonicalUploadedFileId! : anchor.uploadedFileId;
        const key = `${uploadedFileId}:${anchor.pageStart}:${anchor.pageEnd}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...anchor, uploadedFileId }];
      });
      const after = { ...before, sourceAnchors, status: sourceAnchors.length === 0 ? 'dormant' : issue.status, updatedAt: repairAt };
      if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationLegalIssueState', targetId: issue._id.toString(), before, after, reasons })) sequence += 1;
    }
    await ctx.db.patch(run._id, { status: 'snapshotted', updatedAt: repairAt });
    await insertEvent(ctx, {
      repairRunId: args.repairRunId,
      eventType: 'derived_state_snapshot_completed',
      operatorId: run.operatorId,
      approvalId: run.approvalId,
      detail: { snapshotCount: sequence, conversationId: run.scopeConversationId, canonicalUploadedFileId: canonicalId },
    });
    return { idempotent: false as const, snapshotCount: sequence };
  },
});

export const snapshotAuthorizedRepair = internalMutation({
  args: { repairRunId: v.string() },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status === 'snapshotted') {
      return { idempotent: true, snapshotCount: (await ctx.db.query('productionStateRepairSnapshots').withIndex('by_run_sequence', (q) => q.eq('repairRunId', args.repairRunId)).collect()).length };
    }
    if (run.status !== 'authorized') throw new Error(`Repair run is not authorized (${run.status})`);
    const targetIds = new Set(run.approvedTargetUploadedFileIds.map(String));
    const repairAt = Date.now();
    let sequence = 0;
    const affectedConversationIds = new Set<string>();
    const targetGenerationIds = new Set<string>();
    const reasonsByFile = new Map<string, string[]>();
    for (const uploadedFileId of run.approvedTargetUploadedFileIds) {
      const [file, item] = await Promise.all([
        ctx.db.get(uploadedFileId),
        ctx.db.query('productionStateRepairItems').withIndex('by_run_file', (q) => q.eq('repairRunId', args.repairRunId).eq('uploadedFileId', uploadedFileId)).unique(),
      ]);
      if (!file || !item) throw new Error(`Approved target ${uploadedFileId} no longer exists`);
      reasonsByFile.set(uploadedFileId.toString(), item.discoveryReasons);
      if (file.conversationId) affectedConversationIds.add(file.conversationId.toString());
      const generations = await ctx.db.query('documentMemoryGenerations').withIndex('by_file_generation', (q) => q.eq('uploadedFileId', uploadedFileId)).collect();
      generations.forEach((generation) => targetGenerationIds.add(generation._id.toString()));
      const provenance = item.classification === 'confirmed_synthetic' ? 'synthetic' : 'qa';
      const before = {
        status: file.status,
        dataProvenance: file.dataProvenance,
        qaRunId: file.qaRunId,
        qaNamespace: file.qaNamespace,
        provenanceClassifiedAt: file.provenanceClassifiedAt,
        quarantinedAt: file.quarantinedAt,
        quarantineReason: file.quarantineReason,
        updatedAt: file.updatedAt,
      };
      const after = {
        ...before,
        status: 'quarantined',
        dataProvenance: provenance,
        qaNamespace: file.qaNamespace ?? `qa:${file.clerkUserId}`,
        provenanceClassifiedAt: file.provenanceClassifiedAt ?? repairAt,
        quarantinedAt: repairAt,
        quarantineReason: `production_state_repair:${args.repairRunId}`,
        updatedAt: repairAt,
      };
      if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'uploadedFiles', targetId: uploadedFileId.toString(), before, after, reasons: item.discoveryReasons })) sequence += 1;
    }

    for (const conversationIdString of affectedConversationIds) {
      const conversationId = conversationIdString as Id<'conversations'>;
      const [documentState, controlState, tasks, plans, issues] = await Promise.all([
        ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', conversationId)).first(),
        ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', conversationId)).first(),
        ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', conversationId)).collect(),
        ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', conversationId)).collect(),
        ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', conversationId)).collect(),
      ]);
      const reasons = uniqueStrings([...reasonsByFile.values()].flat());
      if (documentState) {
        const before = { activeUploadedFileId: documentState.activeUploadedFileId, lastReferencedUploadedFileIds: documentState.lastReferencedUploadedFileIds, pinnedUploadedFileIds: documentState.pinnedUploadedFileIds, lastDocumentAnalysisTurnId: documentState.lastDocumentAnalysisTurnId, lastDocumentReferenceAt: documentState.lastDocumentReferenceAt, updatedAt: documentState.updatedAt };
        const remainingReferences = withoutTargets(documentState.lastReferencedUploadedFileIds.map(String), targetIds);
        const remainingPinned = withoutTargets(documentState.pinnedUploadedFileIds.map(String), targetIds);
        const activeWasQuarantined = documentState.activeUploadedFileId
          ? targetIds.has(documentState.activeUploadedFileId.toString())
          : false;
        const referencesChanged = remainingReferences.length !== documentState.lastReferencedUploadedFileIds.length;
        const documentStateAffected = activeWasQuarantined || referencesChanged ||
          remainingPinned.length !== documentState.pinnedUploadedFileIds.length;
        const after = {
          ...before,
          activeUploadedFileId: activeWasQuarantined ? null : documentState.activeUploadedFileId,
          lastReferencedUploadedFileIds: remainingReferences,
          pinnedUploadedFileIds: remainingPinned,
          lastDocumentAnalysisTurnId: referencesChanged && remainingReferences.length === 0 ? null : documentState.lastDocumentAnalysisTurnId,
          lastDocumentReferenceAt: referencesChanged && remainingReferences.length === 0 ? null : documentState.lastDocumentReferenceAt,
          updatedAt: documentStateAffected ? repairAt : documentState.updatedAt,
        };
        if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationDocumentState', targetId: documentState._id.toString(), before, after, reasons })) sequence += 1;
      }
      if (controlState) {
        const pendingTargetsQuarantined = containsAnyTarget(controlState.pendingOptionsJson, targetIds);
        const offerTargetsQuarantined = containsAnyTarget(controlState.lastAssistantOfferJson, targetIds);
        const referentsTargetQuarantined = containsAnyTarget(controlState.lastResolvedReferentsJson, targetIds);
        const remainingActiveDocuments = withoutTargets(controlState.activeDocumentIds.map(String), targetIds);
        const activeTaskTargetsQuarantined = tasks.some((task) =>
          task.taskId === controlState.activeTaskId && task.documentIds.some((documentId) => targetIds.has(documentId.toString()))
        );
        const shouldClearActiveTask = activeTaskTargetsQuarantined ||
          (remainingActiveDocuments.length !== controlState.activeDocumentIds.length &&
            (controlState.activeTaskKind === 'document_review' || controlState.activeTaskKind === 'document_question'));
        const remainingEvidenceGenerations = withoutTargets(controlState.activeEvidenceGenerationIds.map(String), targetGenerationIds);
        const controlAffected = shouldClearActiveTask || pendingTargetsQuarantined || offerTargetsQuarantined ||
          referentsTargetQuarantined || remainingActiveDocuments.length !== controlState.activeDocumentIds.length ||
          remainingEvidenceGenerations.length !== controlState.activeEvidenceGenerationIds.length;
        const before = { activeTaskId: controlState.activeTaskId, activeTaskKind: controlState.activeTaskKind, activeDocumentIds: controlState.activeDocumentIds, activeEvidenceGenerationIds: controlState.activeEvidenceGenerationIds, pendingAct: controlState.pendingAct, pendingOptionsJson: controlState.pendingOptionsJson, pendingSourceTurnId: controlState.pendingSourceTurnId, lastAssistantOfferJson: controlState.lastAssistantOfferJson, lastResolvedReferentsJson: controlState.lastResolvedReferentsJson, confidence: controlState.confidence, provenance: controlState.provenance, updatedAt: controlState.updatedAt };
        const after = {
          ...before,
          activeTaskId: shouldClearActiveTask ? null : controlState.activeTaskId,
          activeTaskKind: shouldClearActiveTask ? null : controlState.activeTaskKind,
          activeDocumentIds: remainingActiveDocuments,
          activeEvidenceGenerationIds: remainingEvidenceGenerations,
          pendingAct: pendingTargetsQuarantined ? null : controlState.pendingAct,
          pendingOptionsJson: pendingTargetsQuarantined ? null : controlState.pendingOptionsJson,
          pendingSourceTurnId: pendingTargetsQuarantined ? null : controlState.pendingSourceTurnId,
          lastAssistantOfferJson: offerTargetsQuarantined ? null : controlState.lastAssistantOfferJson,
          lastResolvedReferentsJson: referentsTargetQuarantined ? null : controlState.lastResolvedReferentsJson,
          confidence: controlAffected ? 1 : controlState.confidence,
          provenance: controlAffected ? 'recovered' : controlState.provenance,
          updatedAt: controlAffected ? repairAt : controlState.updatedAt,
        };
        if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationControlStates', targetId: controlState._id.toString(), before, after, reasons })) sequence += 1;
      }
      for (const task of tasks) {
        const remainingDocs = withoutTargets(task.documentIds.map(String), targetIds);
        const remainingGenerations = withoutTargets(task.evidenceGenerationIds.map(String), targetGenerationIds);
        const removed = remainingDocs.length !== task.documentIds.length || remainingGenerations.length !== task.evidenceGenerationIds.length;
        if (!removed) continue;
        const before = { documentIds: task.documentIds, evidenceGenerationIds: task.evidenceGenerationIds, status: task.status, updatedAt: task.updatedAt };
        const after = { ...before, documentIds: remainingDocs, evidenceGenerationIds: remainingGenerations, status: remainingDocs.length === 0 && (task.kind === 'document_review' || task.kind === 'document_question') ? 'abandoned' : task.status, updatedAt: repairAt };
        if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationTasks', targetId: task._id.toString(), before, after, reasons })) sequence += 1;
      }
      for (const plan of plans) {
        const selected = withoutTargets(plan.selectedDocumentIds.map(String), targetIds);
        if (selected.length === plan.selectedDocumentIds.length) continue;
        const before = { selectedDocumentIds: plan.selectedDocumentIds, status: plan.status, updatedAt: plan.updatedAt };
        const after = { ...before, selectedDocumentIds: selected, status: selected.length === 0 && (plan.status === 'planned' || plan.status === 'executing') ? 'failed_recoverable' : plan.status, updatedAt: repairAt };
        if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'turnExecutionPlans', targetId: plan._id.toString(), before, after, reasons })) sequence += 1;
      }
      for (const issue of issues) {
        const anchors = issue.sourceAnchors.filter((anchor) => !targetIds.has(anchor.uploadedFileId.toString()));
        if (anchors.length === issue.sourceAnchors.length) continue;
        const before = { sourceAnchors: issue.sourceAnchors, status: issue.status, updatedAt: issue.updatedAt };
        const after = { ...before, sourceAnchors: anchors, status: anchors.length === 0 ? 'dormant' : issue.status, updatedAt: repairAt };
        if (await snapshotRecord(ctx, { repairRunId: args.repairRunId, sequence, targetTable: 'conversationLegalIssueState', targetId: issue._id.toString(), before, after, reasons })) sequence += 1;
      }
    }
    await ctx.db.patch(run._id, { status: 'snapshotted', updatedAt: Date.now() });
    await insertEvent(ctx, { repairRunId: args.repairRunId, eventType: 'snapshot_completed', operatorId: run.operatorId, approvalId: run.approvalId, detail: { snapshotCount: sequence, targets: [...targetIds] } });
    return { idempotent: false, snapshotCount: sequence };
  },
});

async function readSnapshotTarget(ctx: MutationCtx, snapshot: Doc<'productionStateRepairSnapshots'>) {
  switch (snapshot.targetTable) {
    case 'uploadedFiles': return ctx.db.get(snapshot.targetId as Id<'uploadedFiles'>);
    case 'conversations': return ctx.db.get(snapshot.targetId as Id<'conversations'>);
    case 'conversationDocumentState': return ctx.db.get(snapshot.targetId as Id<'conversationDocumentState'>);
    case 'conversationControlStates': return ctx.db.get(snapshot.targetId as Id<'conversationControlStates'>);
    case 'conversationTasks': return ctx.db.get(snapshot.targetId as Id<'conversationTasks'>);
    case 'turnExecutionPlans': return ctx.db.get(snapshot.targetId as Id<'turnExecutionPlans'>);
    case 'conversationLegalIssueState': return ctx.db.get(snapshot.targetId as Id<'conversationLegalIssueState'>);
  }
}

async function patchSnapshotTarget(ctx: MutationCtx, snapshot: Doc<'productionStateRepairSnapshots'>, patch: JsonFields) {
  switch (snapshot.targetTable) {
    case 'uploadedFiles': return ctx.db.patch(snapshot.targetId as Id<'uploadedFiles'>, patch as Partial<Doc<'uploadedFiles'>>);
    case 'conversations': return ctx.db.patch(snapshot.targetId as Id<'conversations'>, patch as Partial<Doc<'conversations'>>);
    case 'conversationDocumentState': return ctx.db.patch(snapshot.targetId as Id<'conversationDocumentState'>, patch as Partial<Doc<'conversationDocumentState'>>);
    case 'conversationControlStates': return ctx.db.patch(snapshot.targetId as Id<'conversationControlStates'>, patch as Partial<Doc<'conversationControlStates'>>);
    case 'conversationTasks': return ctx.db.patch(snapshot.targetId as Id<'conversationTasks'>, patch as Partial<Doc<'conversationTasks'>>);
    case 'turnExecutionPlans': return ctx.db.patch(snapshot.targetId as Id<'turnExecutionPlans'>, patch as Partial<Doc<'turnExecutionPlans'>>);
    case 'conversationLegalIssueState': return ctx.db.patch(snapshot.targetId as Id<'conversationLegalIssueState'>, patch as Partial<Doc<'conversationLegalIssueState'>>);
  }
}

export const applyRepairBatch = internalMutation({
  args: { repairRunId: v.string(), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status === 'verified') return { applied: 0, conflicts: 0, isDone: true, idempotent: true };
    if (!['snapshotted', 'applying'].includes(run.status)) throw new Error(`Repair run cannot apply from ${run.status}`);
    const snapshots = await ctx.db.query('productionStateRepairSnapshots')
      .withIndex('by_run_state', (q) => q.eq('repairRunId', args.repairRunId).eq('state', 'pending'))
      .take(bounded(args.batchSize, 20, MAX_SNAPSHOT_BATCH));
    let applied = 0;
    let conflicts = 0;
    for (const snapshot of snapshots) {
      const current = await readSnapshotTarget(ctx, snapshot);
      if (!current) {
        await ctx.db.patch(snapshot._id, { state: 'conflict', conflictSafe: 'target_missing', updatedAt: Date.now() });
        conflicts += 1;
        continue;
      }
      const currentHash = stableRepairHash(projectCurrent(current, snapshot.beforeJson));
      if (currentHash !== snapshot.beforeHash) {
        await ctx.db.patch(snapshot._id, { state: 'conflict', conflictSafe: 'changed_since_snapshot', updatedAt: Date.now() });
        conflicts += 1;
        continue;
      }
      await patchSnapshotTarget(ctx, snapshot, decodePatch(snapshot.intendedAfterJson));
      await ctx.db.patch(snapshot._id, { state: 'applied', appliedAt: Date.now(), updatedAt: Date.now() });
      applied += 1;
    }
    const remaining = await ctx.db.query('productionStateRepairSnapshots')
      .withIndex('by_run_state', (q) => q.eq('repairRunId', args.repairRunId).eq('state', 'pending')).first();
    await ctx.db.patch(run._id, { status: remaining ? 'applying' : 'verifying', updatedAt: Date.now() });
    await insertEvent(ctx, { repairRunId: args.repairRunId, eventType: 'repair_batch_applied', operatorId: run.operatorId, approvalId: run.approvalId, detail: { applied, conflicts, remaining: Boolean(remaining) } });
    return { applied, conflicts, isDone: !remaining, idempotent: false };
  },
});

export const verifyRepair = internalMutation({
  args: { repairRunId: v.string() },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (!['verifying', 'verified'].includes(run.status)) throw new Error(`Repair run cannot verify from ${run.status}`);
    const snapshots = await ctx.db.query('productionStateRepairSnapshots')
      .withIndex('by_run_sequence', (q) => q.eq('repairRunId', args.repairRunId)).collect();
    let mismatches = 0;
    let conflicts = 0;
    for (const snapshot of snapshots) {
      if (snapshot.state === 'conflict') { conflicts += 1; continue; }
      const current = await readSnapshotTarget(ctx, snapshot);
      if (!current || stableRepairHash(projectCurrent(current, snapshot.intendedAfterJson)) !== snapshot.intendedAfterHash) mismatches += 1;
    }
    let derivedSemanticMismatches = 0;
    if (run.parentRepairRunId && run.scopeConversationId) {
      const removedIds = new Set([
        ...run.approvedTargetUploadedFileIds.map(String),
        ...(run.duplicateUploadedFileIds ?? []).map(String),
      ]);
      const removedGenerationIds = new Set<string>();
      for (const uploadedFileId of [...run.approvedTargetUploadedFileIds, ...(run.duplicateUploadedFileIds ?? [])]) {
        const generations = await ctx.db.query('documentMemoryGenerations')
          .withIndex('by_file_generation', (q) => q.eq('uploadedFileId', uploadedFileId))
          .collect();
        generations.forEach((generation) => removedGenerationIds.add(generation._id.toString()));
      }
      const [documentState, controlState, tasks, plans, issues] = await Promise.all([
        ctx.db.query('conversationDocumentState').withIndex('by_conversation', (q) => q.eq('conversationId', run.scopeConversationId!)).first(),
        ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', run.scopeConversationId!)).first(),
        ctx.db.query('conversationTasks').withIndex('by_conversation_status', (q) => q.eq('conversationId', run.scopeConversationId!)).collect(),
        ctx.db.query('turnExecutionPlans').withIndex('by_conversation_status', (q) => q.eq('conversationId', run.scopeConversationId!)).collect(),
        ctx.db.query('conversationLegalIssueState').withIndex('by_conversation_status', (q) => q.eq('conversationId', run.scopeConversationId!)).collect(),
      ]);
      const canonicalId = run.canonicalUploadedFileId?.toString();
      if (canonicalId && (!documentState || documentState.activeUploadedFileId?.toString() !== canonicalId)) derivedSemanticMismatches += 1;
      if (canonicalId && (!controlState || !controlState.activeDocumentIds.map(String).includes(canonicalId))) derivedSemanticMismatches += 1;
      if (documentState && [
        ...(documentState.activeUploadedFileId ? [documentState.activeUploadedFileId.toString()] : []),
        ...documentState.lastReferencedUploadedFileIds.map(String),
        ...documentState.pinnedUploadedFileIds.map(String),
      ].some((id) => removedIds.has(id))) derivedSemanticMismatches += 1;
      if (controlState && (
        controlState.activeDocumentIds.map(String).some((id) => removedIds.has(id)) ||
        controlState.activeEvidenceGenerationIds.map(String).some((id) => removedGenerationIds.has(id)) ||
        containsAnyTarget(controlState.pendingOptionsJson, removedIds) ||
        containsAnyTarget(controlState.lastAssistantOfferJson, removedIds) ||
        containsAnyTarget(controlState.lastResolvedReferentsJson, removedIds)
      )) derivedSemanticMismatches += 1;
      if (tasks.some((task) =>
        task.documentIds.some((id) => removedIds.has(id.toString())) ||
        task.evidenceGenerationIds.some((id) => removedGenerationIds.has(id.toString()))
      )) derivedSemanticMismatches += 1;
      if (plans.some((plan) => plan.selectedDocumentIds.some((id) => removedIds.has(id.toString())))) derivedSemanticMismatches += 1;
      if (issues.some((issue) => issue.sourceAnchors.some((anchor) => removedIds.has(anchor.uploadedFileId.toString())))) derivedSemanticMismatches += 1;
    }
    const verified = mismatches === 0 && conflicts === 0 && derivedSemanticMismatches === 0;
    const report = {
      snapshotCount: snapshots.length,
      mismatches,
      conflicts,
      derivedSemanticMismatches,
      verified,
      idempotentPendingChanges: snapshots.filter((snapshot) => snapshot.state === 'pending').length,
    };
    await ctx.db.patch(run._id, { status: verified ? 'verified' : 'failed', reportJson: JSON.stringify(report), errorSafe: verified ? undefined : 'repair_verification_failed', completedAt: Date.now(), updatedAt: Date.now() });
    await insertEvent(ctx, { repairRunId: args.repairRunId, eventType: verified ? 'repair_verified' : 'repair_verification_failed', operatorId: run.operatorId, approvalId: run.approvalId, detail: report });
    return report;
  },
});

export const restoreRepairBatch = internalMutation({
  args: {
    repairRunId: v.string(),
    operatorId: v.string(),
    approvalId: v.string(),
    confirmation: v.literal(RESTORE_CONFIRMATION),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status === 'restored') return { restored: 0, conflicts: 0, isDone: true, idempotent: true };
    if (!['verified', 'restoring'].includes(run.status)) throw new Error(`Repair run cannot restore from ${run.status}`);
    const snapshots = await ctx.db.query('productionStateRepairSnapshots')
      .withIndex('by_run_state', (q) => q.eq('repairRunId', args.repairRunId).eq('state', 'applied'))
      .take(bounded(args.batchSize, 20, MAX_SNAPSHOT_BATCH));
    let restored = 0;
    let conflicts = 0;
    for (const snapshot of snapshots) {
      const current = await readSnapshotTarget(ctx, snapshot);
      if (!current || stableRepairHash(projectCurrent(current, snapshot.intendedAfterJson)) !== snapshot.intendedAfterHash) {
        await ctx.db.patch(snapshot._id, { state: 'conflict', conflictSafe: 'changed_since_repair', updatedAt: Date.now() });
        conflicts += 1;
        continue;
      }
      await patchSnapshotTarget(ctx, snapshot, decodePatch(snapshot.beforeJson));
      await ctx.db.patch(snapshot._id, { state: 'restored', restoredAt: Date.now(), updatedAt: Date.now() });
      restored += 1;
    }
    const remaining = await ctx.db.query('productionStateRepairSnapshots')
      .withIndex('by_run_state', (q) => q.eq('repairRunId', args.repairRunId).eq('state', 'applied')).first();
    await ctx.db.patch(run._id, { status: remaining ? 'restoring' : 'restored', operatorId: args.operatorId, approvalId: args.approvalId, completedAt: remaining ? undefined : Date.now(), updatedAt: Date.now() });
    await insertEvent(ctx, { repairRunId: args.repairRunId, eventType: 'restore_batch', operatorId: args.operatorId, approvalId: args.approvalId, detail: { restored, conflicts, remaining: Boolean(remaining) } });
    return { restored, conflicts, isDone: !remaining, idempotent: false };
  },
});

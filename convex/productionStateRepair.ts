import { v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { isUploadE2ERobotEmail } from './lib/chatRateLimitPolicy';
import { qaRunIdFromFilename } from './lib/qaProvenance';
import {
  classifyRepairCandidate,
  containsAnyTarget,
  stableRepairHash,
  withoutTargets,
} from '../src/lib/nexx/qaStateRepair';

const MAX_AUDIT_BATCH = 25;
const MAX_APPROVED_TARGETS = 20;
const MAX_SNAPSHOT_BATCH = 50;
const REPAIR_CONFIRMATION = 'AUTHORIZE_QA_QUARANTINE';
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
    confirmation: v.literal(REPAIR_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.repairRunId);
    if (run.status !== 'awaiting_approval') throw new Error(`Repair run is not awaiting approval (${run.status})`);
    if (!run.auditComplete) throw new Error('Audit is not complete');
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
    const verified = mismatches === 0 && conflicts === 0;
    const report = { snapshotCount: snapshots.length, mismatches, conflicts, verified, idempotentPendingChanges: snapshots.filter((snapshot) => snapshot.state === 'pending').length };
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

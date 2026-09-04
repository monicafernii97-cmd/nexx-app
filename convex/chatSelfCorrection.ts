import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { stableCapabilityHash } from '../src/lib/nexx/capabilities/documentCapabilityLedger';
import {
  SELF_CORRECTION_MAX_ATTEMPTS,
  classifySelfCorrectionContradictions,
  planSelfCorrection,
  type PriorTurnInspectionReceipt,
  type SelfCorrectionPlan,
} from '../src/lib/nexx/response/selfCorrection';
import { getAuthenticatedUserAndConversation } from './lib/auth';
import { isDocumentEligibleForChat } from './lib/qaProvenance';
import { isUploadE2ERobotEmail } from './lib/chatRateLimitPolicy';

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseObject(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    return objectValue(JSON.parse(value));
  } catch {
    return {};
  }
}

function readableDocumentCount(metadata: unknown) {
  const capabilitySnapshot = objectValue(objectValue(metadata).capabilitySnapshot);
  const documents = Array.isArray(capabilitySnapshot.documents) ? capabilitySnapshot.documents : [];
  return documents.filter((value) => {
    const document = objectValue(value);
    return document.authorized === true &&
      (document.textExtracted === true || document.chunksAvailable === true);
  }).length;
}

function stalePendingAction(control: Doc<'conversationControlStates'> | null) {
  if (!control?.pendingAct) return false;
  let options: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(control.pendingOptionsJson ?? '[]') as unknown;
    options = Array.isArray(parsed) ? parsed.map(objectValue) : [];
  } catch {
    return true;
  }
  return options.some((option) =>
    (typeof option.expiresAfterFocusRevision === 'number' && option.expiresAfterFocusRevision < control.focusRevision) ||
    (typeof option.targetTaskId === 'string' && option.targetTaskId !== control.activeTaskId)
  );
}

function storedPlan(row: Doc<'conversationRepairAudits'>): SelfCorrectionPlan {
  return {
    actions: row.plannedActions as SelfCorrectionPlan['actions'],
    contradictionCodes: row.contradictionCodes as SelfCorrectionPlan['contradictionCodes'],
    maxActions: 2,
    exhausted: row.status === 'exhausted',
    terminalReason: row.terminalReason as SelfCorrectionPlan['terminalReason'],
  };
}

export const inspectDocumentCapability = internalQuery({
  args: {
    currentTurnId: v.id('chatTurns'),
    uploadedFileId: v.id('uploadedFiles'),
  },
  handler: async (ctx, args) => {
    const [turn, uploadedFile] = await Promise.all([
      ctx.db.get(args.currentTurnId),
      ctx.db.get(args.uploadedFileId),
    ]);
    if (!turn || !uploadedFile) throw new Error('self_correction_document_not_found');
    const [conversation, user] = await Promise.all([
      ctx.db.get(turn.conversationId),
      ctx.db.get(turn.userId),
    ]);
    if (
      !conversation || !user ||
      conversation.userId !== user._id ||
      uploadedFile.clerkUserId !== user.clerkId ||
      (conversation.caseId
        ? uploadedFile.caseId !== conversation.caseId
        : uploadedFile.caseId !== undefined) ||
      (uploadedFile.conversationId && uploadedFile.conversationId !== conversation._id)
    ) {
      throw new Error('self_correction_document_scope_mismatch');
    }
    if (!isDocumentEligibleForChat(uploadedFile, isUploadE2ERobotEmail(user.email))) {
      throw new Error('self_correction_document_quarantined');
    }
    return {
      uploadedFileId: uploadedFile._id,
      stored: Boolean(uploadedFile.storageId || uploadedFile.storageKey),
      extracted: Boolean(uploadedFile.extractionCharCount || uploadedFile.chatContextCharCount),
      searchable: Boolean(uploadedFile.chunkCount || uploadedFile.memoryIndexedAt),
      fullyReviewed: uploadedFile.fullDocumentReviewStatus === 'ready',
      status: uploadedFile.status,
      retryable: uploadedFile.status === 'failed' || uploadedFile.fullDocumentReviewStatus === 'failed',
    };
  },
});

export const inspectPendingAction = internalQuery({
  args: { currentTurnId: v.id('chatTurns') },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.currentTurnId);
    if (!turn) throw new Error('self_correction_turn_not_found');
    const control = await ctx.db.query('conversationControlStates')
      .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
      .first();
    if (!control || control.userId !== turn.userId) throw new Error('self_correction_pending_scope_mismatch');
    return {
      pendingAct: control.pendingAct,
      pendingSourceTurnId: control.pendingSourceTurnId,
      focusRevision: control.focusRevision,
      pendingOptionsJson: control.pendingOptionsJson,
      assistantOfferJson: control.lastAssistantOfferJson,
      stale: stalePendingAction(control),
    };
  },
});

export const inspectFailure = internalQuery({
  args: {
    currentTurnId: v.id('chatTurns'),
    targetTurnId: v.id('chatTurns'),
  },
  handler: async (ctx, args) => {
    const [currentTurn, targetTurn] = await Promise.all([
      ctx.db.get(args.currentTurnId),
      ctx.db.get(args.targetTurnId),
    ]);
    if (
      !currentTurn || !targetTurn ||
      currentTurn.conversationId !== targetTurn.conversationId ||
      currentTurn.userId !== targetTurn.userId
    ) {
      throw new Error('self_correction_failure_scope_mismatch');
    }
    const job = await ctx.db.query('chatGenerationJobs')
      .withIndex('by_turn', (q) => q.eq('turnId', targetTurn._id))
      .first();
    return {
      status: job?.status ?? targetTurn.status,
      errorCode: job?.errorCode ?? targetTurn.errorCode,
      retryable: job?.status === 'failed_retryable' ||
        job?.status === 'failed_recoverable' ||
        targetTurn.errorRetryable === true,
    };
  },
});

export const getRepairTimeline = query({
  args: { conversationId: v.id('conversations'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
    const rows = await ctx.db.query('conversationRepairAudits')
      .withIndex('by_conversation_created', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(limit);
    return rows.map((row) => {
      if (row.userId !== user._id) throw new Error('self_correction_timeline_scope_mismatch');
      return {
        repairId: row.repairId,
        currentTurnId: row.currentTurnId,
        targetTurnId: row.targetTurnId,
        targetMessageId: row.targetMessageId,
        trigger: row.trigger,
        status: row.status,
        contradictionCodes: row.contradictionCodes,
        plannedActions: row.plannedActions,
        appliedActions: row.appliedActions,
        terminalReason: row.terminalReason,
        escalationRequired: row.escalationRequired ?? false,
        escalatedAt: row.escalatedAt,
        attempt: row.attempt,
        maxAttempts: row.maxAttempts,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  },
});

export const inspectPriorResponseAndPlan = internalMutation({
  args: {
    currentTurnId: v.id('chatTurns'),
    targetMessageId: v.id('messages'),
  },
  handler: async (ctx, args) => {
    const [currentTurn, targetMessage] = await Promise.all([
      ctx.db.get(args.currentTurnId),
      ctx.db.get(args.targetMessageId),
    ]);
    if (!currentTurn) throw new Error('self_correction_current_turn_not_found');
    if (
      !targetMessage ||
      targetMessage.role !== 'assistant' ||
      (targetMessage.status !== undefined && targetMessage.status !== 'committed')
    ) {
      throw new Error('self_correction_target_not_committed');
    }
    if (
      targetMessage.conversationId !== currentTurn.conversationId ||
      (targetMessage.userId !== undefined && targetMessage.userId !== currentTurn.userId) ||
      !targetMessage.turnId
    ) {
      throw new Error('self_correction_scope_mismatch');
    }

    const existing = await ctx.db.query('conversationRepairAudits')
      .withIndex('by_current_turn', (q) => q.eq('currentTurnId', currentTurn._id))
      .first();
    if (existing) {
      if (existing.targetMessageId !== targetMessage._id || existing.userId !== currentTurn.userId) {
        throw new Error('self_correction_existing_scope_mismatch');
      }
      const activePlan = currentTurn.executionPlanId
        ? await ctx.db.get(currentTurn.executionPlanId)
        : null;
      return {
        auditId: existing._id,
        receipt: JSON.parse(existing.inspectionReceiptJson) as PriorTurnInspectionReceipt,
        repairPlan: storedPlan(existing),
        executionPlan: activePlan,
      };
    }

    const [targetTurn, conversation] = await Promise.all([
      ctx.db.get(targetMessage.turnId),
      ctx.db.get(currentTurn.conversationId),
    ]);
    if (
      !targetTurn || !conversation ||
      targetTurn.userId !== currentTurn.userId ||
      conversation.userId !== currentTurn.userId
    ) {
      throw new Error('self_correction_target_turn_scope_mismatch');
    }
    const [priorUnderstanding, priorPlan, priorAudit, priorJob, currentUnderstanding, currentPlan, control] = await Promise.all([
      targetTurn.understandingId ? ctx.db.get(targetTurn.understandingId) : Promise.resolve(null),
      targetTurn.executionPlanId ? ctx.db.get(targetTurn.executionPlanId) : Promise.resolve(null),
      ctx.db.query('responsePublicationAudits')
        .withIndex('by_turn', (q) => q.eq('turnId', targetTurn._id))
        .order('desc')
        .first(),
      ctx.db.query('chatGenerationJobs').withIndex('by_turn', (q) => q.eq('turnId', targetTurn._id)).first(),
      currentTurn.understandingId ? ctx.db.get(currentTurn.understandingId) : Promise.resolve(null),
      currentTurn.executionPlanId ? ctx.db.get(currentTurn.executionPlanId) : Promise.resolve(null),
      ctx.db.query('conversationControlStates')
        .withIndex('by_conversation', (q) => q.eq('conversationId', currentTurn.conversationId))
        .first(),
    ]);
    if (
      priorUnderstanding?.userId !== currentTurn.userId ||
      priorPlan?.userId !== currentTurn.userId ||
      currentUnderstanding?.userId !== currentTurn.userId ||
      currentPlan?.userId !== currentTurn.userId ||
      control?.userId !== currentTurn.userId
    ) {
      throw new Error('self_correction_orchestration_scope_mismatch');
    }

    const activation = parseObject(priorPlan?.documentActivationJson);
    const responseFingerprint = stableCapabilityHash(targetMessage.content.trim());
    const previousSameFingerprint = await ctx.db.query('conversationRepairAudits')
      .withIndex('by_response_fingerprint', (q) =>
        q.eq('conversationId', currentTurn.conversationId).eq('responseFingerprint', responseFingerprint)
      )
      .first();
    const receiptId = `inspection_${stableCapabilityHash({
      currentTurnId: currentTurn._id,
      targetMessageId: targetMessage._id,
      responseFingerprint,
      capabilitySnapshotHash: targetTurn.capabilitySnapshotHash,
    }).slice(0, 24)}`;
    const receipt: PriorTurnInspectionReceipt = {
      receiptVersion: 1,
      receiptId,
      targetMessageId: targetMessage._id.toString(),
      targetTurnId: targetTurn._id.toString(),
      inspectedAt: Date.now(),
      responseFingerprint,
      foreground: {
        speechAct: priorUnderstanding?.speechAct,
        routeMode: priorPlan?.routeMode ?? targetTurn.routeMode,
        selectedDocumentIds: priorPlan?.selectedDocumentIds.map(String) ?? [],
        documentActivationActive: activation.active === true,
      },
      capability: {
        snapshotHash: targetTurn.capabilitySnapshotHash,
        readableDocumentCount: readableDocumentCount(targetMessage.metadata),
      },
      publication: {
        decision: priorAudit?.decision,
        rejectionCodes: priorAudit?.rejectionCodes ?? [],
        validatorVersion: priorAudit?.validatorVersion,
      },
      operation: {
        status: priorJob?.status,
        errorCode: priorJob?.errorCode,
        retryable: priorJob?.status === 'failed_retryable' || priorJob?.status === 'failed_recoverable',
      },
    };
    const priorRepairs = await ctx.db.query('conversationRepairAudits')
      .withIndex('by_target_message', (q) => q.eq('targetMessageId', targetMessage._id))
      .collect();
    const priorAutomaticAttemptCount = priorRepairs.filter((repair) =>
      repair.status === 'applied' || repair.status === 'succeeded' || repair.status === 'exhausted'
    ).length;
    const contradictions = classifySelfCorrectionContradictions({
      currentSpeechAct: currentUnderstanding?.speechAct,
      priorResponse: targetMessage.content,
      receipt,
      ambiguityMaterial: currentUnderstanding?.ambiguityMaterial,
      stalePendingAction: stalePendingAction(control),
      repeatedFingerprint: Boolean(previousSameFingerprint),
    });
    const repairPlan = planSelfCorrection({
      contradictionCodes: contradictions,
      priorAutomaticAttemptCount,
    });
    const beforeState = {
      control: control ? {
        focusRevision: control.focusRevision,
        activeDocumentIds: control.activeDocumentIds.map(String),
        pendingAct: control.pendingAct,
        pendingOptionsJson: control.pendingOptionsJson,
      } : null,
      plan: currentPlan ? {
        planId: currentPlan.planId,
        routeMode: currentPlan.routeMode,
        selectedDocumentIds: currentPlan.selectedDocumentIds.map(String),
        status: currentPlan.status,
      } : null,
    };
    const appliedActions: string[] = [];
    let replacementPlan: Doc<'turnExecutionPlans'> | null = currentPlan;

    if (currentPlan && (
      repairPlan.exhausted ||
      (repairPlan.actions.includes('clear_stale_activation') && currentPlan.selectedDocumentIds.length > 0)
    )) {
      await ctx.db.patch(currentPlan._id, { status: 'superseded', updatedAt: Date.now() });
      const replacementPlanId = await ctx.db.insert('turnExecutionPlans', {
        planId: `${currentPlan.planId}_repair_${stableCapabilityHash(receiptId).slice(0, 8)}`,
        turnId: currentTurn._id,
        conversationId: currentTurn.conversationId,
        userId: currentTurn.userId,
        schemaVersion: 1,
        focusRevision: currentPlan.focusRevision,
        taskId: currentPlan.taskId,
        responseAct: repairPlan.exhausted ? 'clarify' : 'correct',
        routeMode: 'adaptive_chat',
        selectedDocumentIds: [],
        evidenceRequirements: [],
        retrievalQueries: [],
        capabilityRequirements: [],
        fallbackOrder: currentPlan.fallbackOrder,
        questionContractJson: JSON.stringify({ kind: repairPlan.exhausted ? 'clarification' : 'correction' }),
        documentActivationJson: JSON.stringify({
          active: false,
          preserveFocus: true,
          source: 'none',
          referenceStrength: 'none',
          reasonCodes: [repairPlan.exhausted
            ? 'self_correction_stopped_before_loop'
            : 'self_correction_cleared_stale_activation'],
        }),
        status: 'planned',
        plannerVersion: `${currentPlan.plannerVersion}:self-correction-v1`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(currentTurn._id, {
        executionPlanId: replacementPlanId,
        routeMode: 'adaptive_chat',
        updatedAt: Date.now(),
      });
      replacementPlan = await ctx.db.get(replacementPlanId);
      if (repairPlan.actions.includes('clear_stale_activation')) {
        appliedActions.push('clear_stale_activation');
      }
    }

    if (repairPlan.actions.includes('reset_stale_pending_action') && control) {
      await ctx.db.patch(control._id, {
        pendingAct: undefined,
        pendingOptionsJson: JSON.stringify([]),
        pendingSourceTurnId: undefined,
        lastAssistantOfferJson: undefined,
        updatedAt: Date.now(),
      });
      appliedActions.push('reset_stale_pending_action');
    }

    const afterState = {
      control: control ? {
        focusRevision: control.focusRevision,
        activeDocumentIds: control.activeDocumentIds.map(String),
        pendingAct: repairPlan.actions.includes('reset_stale_pending_action') ? undefined : control.pendingAct,
        pendingOptionsJson: repairPlan.actions.includes('reset_stale_pending_action') ? '[]' : control.pendingOptionsJson,
      } : null,
      plan: replacementPlan ? {
        planId: replacementPlan.planId,
        routeMode: replacementPlan.routeMode,
        selectedDocumentIds: replacementPlan.selectedDocumentIds.map(String),
        status: replacementPlan.status,
      } : null,
    };
    const now = Date.now();
    const auditId = await ctx.db.insert('conversationRepairAudits', {
      repairId: `repair_${stableCapabilityHash(receiptId).slice(0, 24)}`,
      conversationId: currentTurn.conversationId,
      userId: currentTurn.userId,
      caseId: conversation.caseId,
      currentTurnId: currentTurn._id,
      targetTurnId: targetTurn._id,
      targetMessageId: targetMessage._id,
      trigger: currentUnderstanding?.speechAct ?? 'unknown',
      status: repairPlan.exhausted ? 'exhausted' : appliedActions.length > 0 ? 'applied' : 'planned',
      responseFingerprint,
      inspectionReceiptJson: JSON.stringify(receipt),
      contradictionCodes: repairPlan.contradictionCodes,
      plannedActions: repairPlan.actions,
      appliedActions,
      beforeStateHash: stableCapabilityHash(beforeState),
      afterStateHash: stableCapabilityHash(afterState),
      terminalReason: repairPlan.terminalReason,
      escalationRequired: repairPlan.exhausted,
      escalatedAt: repairPlan.exhausted ? now : undefined,
      attempt: priorRepairs.length + 1,
      maxAttempts: SELF_CORRECTION_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    });
    return { auditId, receipt, repairPlan, executionPlan: replacementPlan };
  },
});

export const completeRepair = internalMutation({
  args: {
    auditId: v.id('conversationRepairAudits'),
    currentTurnId: v.id('chatTurns'),
    succeeded: v.boolean(),
    correctionMessageId: v.optional(v.id('messages')),
    terminalReason: v.optional(v.string()),
    completedActions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const [audit, turn] = await Promise.all([ctx.db.get(args.auditId), ctx.db.get(args.currentTurnId)]);
    if (!audit || !turn || audit.currentTurnId !== turn._id || audit.userId !== turn.userId) {
      throw new Error('self_correction_completion_scope_mismatch');
    }
    const appliedActions = Array.from(new Set([
      ...audit.appliedActions,
      ...(args.completedActions ?? []).filter((action) => audit.plannedActions.includes(action)),
    ]));
    const exhausted = !args.succeeded;
    await ctx.db.patch(audit._id, {
      status: args.succeeded ? 'succeeded' : 'exhausted',
      appliedActions,
      correctionMessageId: args.correctionMessageId,
      terminalReason: args.terminalReason,
      escalationRequired: exhausted,
      escalatedAt: exhausted ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
  },
});

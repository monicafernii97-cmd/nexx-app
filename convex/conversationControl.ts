import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthenticatedUserAndConversation } from './lib/auth';
import type { RouteMode } from '../src/lib/types';
import { understandTurn } from '../src/lib/nexx/orchestration/turnUnderstanding';
import { decideFocusTransition } from '../src/lib/nexx/orchestration/focusTransition';
import { buildExecutionPlan } from '../src/lib/nexx/orchestration/executionPlan';
import { detectDocumentReference } from '../src/lib/nexx/documentReferenceDetection';
import { decideDocumentActivation } from '../src/lib/nexx/orchestration/documentActivation';
import { resolveSemanticInteraction } from '../src/lib/nexx/orchestration/semanticInteraction';
import { getExecutiveChatFeatureFlags, type ExecutiveChatFeatureFlags } from '../src/lib/nexx/orchestration/featureFlags';
import { isUploadE2ERobotEmail } from './lib/chatRateLimitPolicy';
import { isDocumentEligibleForChat } from './lib/qaProvenance';
import { canonicalizeDocumentCandidates } from '../src/lib/nexx/qaStateRepair';
import type {
  AssistantOffer,
  ConversationControlSnapshot,
  ConversationTaskSnapshot,
  InteractionIntent,
  PendingOption,
  RecommendationReceipt,
  TurnExecutionPlan,
  TurnUnderstanding,
} from '../src/lib/nexx/orchestration/types';

type ReadCtx = MutationCtx | QueryCtx;

function parseJsonArray<T>(value?: string): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value?: string): T | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : undefined;
  } catch {
    return undefined;
  }
}

function controlSnapshot(row?: Doc<'conversationControlStates'> | null): ConversationControlSnapshot | undefined {
  if (!row) return undefined;
  return {
    schemaVersion: 1,
    focusRevision: row.focusRevision,
    activeTaskId: row.activeTaskId,
    activeTaskKind: row.activeTaskKind,
    activeIssueKey: row.activeIssueKey,
    activeDocumentIds: row.activeDocumentIds.map(String),
    activeEvidenceGenerationIds: row.activeEvidenceGenerationIds.map(String),
    parentTaskId: row.parentTaskId,
    pendingAct: row.pendingAct,
    pendingOptions: parseJsonArray<PendingOption>(row.pendingOptionsJson),
    lastAssistantOffer: parseJsonObject<AssistantOffer>(row.lastAssistantOfferJson),
    pendingInteractionVersion: row.pendingInteractionVersion,
    activeRecommendation: parseJsonObject<RecommendationReceipt>(row.activeRecommendationJson),
    lastInteractionResolutionId: row.lastInteractionResolutionId,
    confidence: row.confidence,
    provenance: row.provenance,
  };
}

function taskSnapshot(row: Doc<'conversationTasks'>): ConversationTaskSnapshot {
  return {
    taskId: row.taskId,
    parentTaskId: row.parentTaskId,
    kind: row.kind,
    status: row.status,
    goal: row.goal,
    normalizedGoal: row.normalizedGoal,
    issueKey: row.issueKey,
    documentIds: row.documentIds.map(String),
    evidenceGenerationIds: row.evidenceGenerationIds.map(String),
    updatedAt: row.updatedAt,
  };
}

async function loadEligibleCanonicalDocumentState(ctx: ReadCtx, args: {
  conversationId: Id<'conversations'>;
  userId: Id<'users'>;
  controlRow?: Doc<'conversationControlStates'> | null;
  taskRows: Doc<'conversationTasks'>[];
}) {
  const [user, conversation] = await Promise.all([
    ctx.db.get(args.userId),
    ctx.db.get(args.conversationId),
  ]);
  if (!user || !conversation || conversation.userId !== args.userId) {
    throw new Error('conversation_control_scope_mismatch');
  }
  const pendingDocumentIds = [
    ...parseJsonArray<PendingOption>(args.controlRow?.pendingOptionsJson).flatMap((option) => option.documentIds),
    ...(parseJsonObject<AssistantOffer>(args.controlRow?.lastAssistantOfferJson)?.documentIds ?? []),
  ];
  const orderedIds = Array.from(new Set([
    ...(args.controlRow?.activeDocumentIds ?? []).map(String),
    ...args.taskRows.flatMap((task) => task.documentIds.map(String)),
    ...pendingDocumentIds,
  ]));
  const clerkId = user.clerkId;
  const activeGrants = clerkId
    ? await ctx.db.query('fileAccessGrants')
        .withIndex('by_subject', (q) => q.eq('subjectType', 'user').eq('subjectId', clerkId))
        .collect()
    : [];
  const now = Date.now();
  const grantedIds = new Set(activeGrants.filter((grant) =>
    grant.permissions.chat &&
    grant.revokedAt === undefined &&
    (grant.expiresAt === undefined || grant.expiresAt > now) &&
    (!grant.caseId || grant.caseId === conversation.caseId)
  ).map((grant) => grant.uploadedFileId.toString()));
  const files = await Promise.all(orderedIds.map((id) => ctx.db.get(id as Id<'uploadedFiles'>)));
  const selection = canonicalizeDocumentCandidates(files.map((file, index) => ({
    uploadedFileId: orderedIds[index],
    eligible: Boolean(
      file &&
      isDocumentEligibleForChat(file, isUploadE2ERobotEmail(user.email ?? '')) &&
      (file.clerkUserId === user.clerkId || grantedIds.has(file._id.toString())) &&
      (!conversation.caseId || !file.caseId || file.caseId === conversation.caseId)
    ),
    storageSha256: file?.storageSha256,
    fullTextSha256: file?.fullTextSha256,
    sha256Hash: file?.sha256Hash,
  })));
  const selected = new Set(selection.selectedDocumentIds);
  const canonicalByDuplicate = new Map(selection.rejected
    .filter((item) => item.reason === 'exact_duplicate' && item.canonicalUploadedFileId)
    .map((item) => [item.uploadedFileId, item.canonicalUploadedFileId!]));
  const resolveDocumentIds = (ids: string[]) => Array.from(new Set(ids.flatMap((id) => {
    if (selected.has(id)) return [id];
    const canonical = canonicalByDuplicate.get(id);
    return canonical && selected.has(canonical) ? [canonical] : [];
  })));

  return { resolveDocumentIds };
}

export async function loadConversationControlContext(ctx: ReadCtx, args: {
  conversationId: Id<'conversations'>;
  userId: Id<'users'>;
}) {
  const [controlRow, taskRows] = await Promise.all([
    ctx.db.query('conversationControlStates')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .first(),
    ctx.db.query('conversationTasks')
      .withIndex('by_conversation_status', (q) => q.eq('conversationId', args.conversationId).eq('status', 'active'))
      .collect(),
  ]);
  if (controlRow && controlRow.userId !== args.userId) throw new Error('conversation_control_scope_mismatch');
  if (taskRows.some((task) => task.userId !== args.userId)) throw new Error('conversation_task_scope_mismatch');
  const eligibility = await loadEligibleCanonicalDocumentState(ctx, {
    conversationId: args.conversationId,
    userId: args.userId,
    controlRow,
    taskRows,
  });
  const rawControl = controlSnapshot(controlRow);
  const controlState = rawControl
    ? {
        ...rawControl,
        activeDocumentIds: eligibility.resolveDocumentIds(rawControl.activeDocumentIds),
        pendingOptions: rawControl.pendingOptions.flatMap((option) => {
          const documentIds = eligibility.resolveDocumentIds(option.documentIds);
          return option.documentIds.length > 0 && documentIds.length === 0 ? [] : [{ ...option, documentIds }];
        }),
        lastAssistantOffer: rawControl.lastAssistantOffer
          ? (() => {
              const documentIds = eligibility.resolveDocumentIds(rawControl.lastAssistantOffer!.documentIds);
              return rawControl.lastAssistantOffer!.documentIds.length > 0 && documentIds.length === 0
                ? undefined
                : { ...rawControl.lastAssistantOffer!, documentIds };
            })()
          : undefined,
      }
    : undefined;
  return {
    row: controlRow,
    controlState,
    tasks: taskRows.map((task) => ({
      ...taskSnapshot(task),
      documentIds: eligibility.resolveDocumentIds(task.documentIds.map(String)),
    })),
  };
}

async function migratedControl(ctx: MutationCtx, args: {
  conversation: Doc<'conversations'>;
  userId: Id<'users'>;
  activeDocumentIds: Id<'uploadedFiles'>[];
}): Promise<ConversationControlSnapshot> {
  const activeIssues = await ctx.db.query('conversationLegalIssueState')
    .withIndex('by_conversation_status', (q) => q.eq('conversationId', args.conversation._id).eq('status', 'focused'))
    .order('desc')
    .take(1);
  const issue = activeIssues[0];
  const issueDocuments = issue?.sourceAnchors.map((anchor) => anchor.uploadedFileId) ?? [];
  const documentIds = Array.from(new Set([...args.activeDocumentIds, ...issueDocuments]));
  const provenance = issue ? 'migrated_issue' as const : 'migrated_route' as const;
  return {
    schemaVersion: 1 as const,
    focusRevision: 0,
    activeTaskId: undefined,
    activeTaskKind: undefined,
    activeIssueKey: issue?.issueKey,
    activeDocumentIds: documentIds.map(String),
    activeEvidenceGenerationIds: [] as string[],
    parentTaskId: undefined,
    pendingAct: undefined,
    pendingOptions: [] as PendingOption[],
    lastAssistantOffer: undefined,
    confidence: issue ? 0.6 : 0.4,
    provenance,
  };
}

function idSet<T extends string>(values: T[]) {
  return Array.from(new Set(values));
}

export async function persistTurnOrchestration(ctx: MutationCtx, args: {
  conversation: Doc<'conversations'>;
  userId: Id<'users'>;
  turnId: Id<'chatTurns'>;
  message: string;
  routeMode: RouteMode;
  attachmentDocumentIds: Id<'uploadedFiles'>[];
  activeDocumentIds: Id<'uploadedFiles'>[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationSummary?: string;
  now: number;
  executiveChatFlags?: ExecutiveChatFeatureFlags;
}) {
  const executiveChatFlags = args.executiveChatFlags ?? getExecutiveChatFeatureFlags();
  const loaded = await loadConversationControlContext(ctx, {
    conversationId: args.conversation._id,
    userId: args.userId,
  });
  const startingControl = loaded.controlState ?? await migratedControl(ctx, {
    conversation: args.conversation,
    userId: args.userId,
    activeDocumentIds: args.activeDocumentIds,
  });
  const activeDocumentIds = idSet([
    ...args.attachmentDocumentIds.map(String),
    ...startingControl.activeDocumentIds,
    ...args.activeDocumentIds.map(String),
  ]);
  const controlWithDocuments: ConversationControlSnapshot = {
    ...startingControl,
    activeDocumentIds,
  };
  const understanding = understandTurn({
    message: args.message,
    controlState: controlWithDocuments,
    activeTasks: loaded.tasks,
    recentUserTurns: args.recentMessages.filter((message) => message.role === 'user'),
    recentAssistantTurns: args.recentMessages.filter((message) => message.role === 'assistant'),
    conversationSummary: args.conversationSummary,
    activeDocumentDescriptors: activeDocumentIds.map((uploadedFileId) => ({ uploadedFileId, filename: uploadedFileId })),
    foregroundIntentV2: executiveChatFlags.documentActivationV2,
  });
  const interactionResolution = resolveSemanticInteraction({
    message: args.message,
    controlState: controlWithDocuments,
    now: args.now,
  });
  const candidateResolvedOption = interactionResolution?.selectedOptionId
    ? startingControl.pendingOptions.find((option) => option.optionId === interactionResolution.selectedOptionId)
    : undefined;
  const resolvedOption = candidateResolvedOption &&
    candidateResolvedOption.targetTaskId === startingControl.activeTaskId &&
    candidateResolvedOption.documentIds.every((id) => activeDocumentIds.includes(id)) &&
    (candidateResolvedOption.evidenceGenerationIds ?? []).every((id) => startingControl.activeEvidenceGenerationIds.includes(id))
      ? candidateResolvedOption
      : undefined;
  if (interactionResolution?.decision === 'execute' && !resolvedOption) {
    throw new Error('interaction_resolution_scope_mismatch');
  }
  const transition = decideFocusTransition({
    message: args.message,
    understanding,
    controlState: controlWithDocuments,
    tasks: loaded.tasks,
  });
  const changesFocus = transition.kind === 'replace' || transition.kind === 'branch' || transition.kind === 'refine';
  const focusRevision = startingControl.focusRevision + (changesFocus ? 1 : 0);
  let taskId = startingControl.activeTaskId;
  let activeTaskKind = startingControl.activeTaskKind;
  let parentTaskId = startingControl.parentTaskId;

  if (transition.kind === 'replace' || transition.kind === 'branch') {
    const task = transition.newTask;
    taskId = task.taskId;
    activeTaskKind = task.kind;
    parentTaskId = transition.kind === 'branch' ? transition.parentTaskId : undefined;
    if (transition.kind === 'replace' && transition.previousTaskId) {
      const previous = await ctx.db.query('conversationTasks')
        .withIndex('by_conversation_task', (q) => q.eq('conversationId', args.conversation._id).eq('taskId', transition.previousTaskId!))
        .first();
      if (previous && previous.userId === args.userId && previous.status === 'active') {
        await ctx.db.patch(previous._id, { status: 'completed', updatedAt: args.now });
      }
    }
    await ctx.db.insert('conversationTasks', {
      conversationId: args.conversation._id,
      userId: args.userId,
      caseId: args.conversation.caseId,
      taskId: task.taskId,
      parentTaskId: task.parentTaskId,
      kind: task.kind,
      status: 'active',
      goal: task.goal,
      normalizedGoal: task.normalizedGoal,
      documentIds: activeDocumentIds.map((id) => id as Id<'uploadedFiles'>),
      evidenceGenerationIds: startingControl.activeEvidenceGenerationIds.map((id) => id as Id<'documentMemoryGenerations'>),
      originatingTurnId: args.turnId,
      latestTurnId: args.turnId,
      createdAt: args.now,
      updatedAt: args.now,
    });
  } else if (taskId) {
    const existingTask = await ctx.db.query('conversationTasks')
      .withIndex('by_conversation_task', (q) => q.eq('conversationId', args.conversation._id).eq('taskId', taskId!))
      .first();
    if (existingTask && existingTask.userId === args.userId) {
      await ctx.db.patch(existingTask._id, {
        documentIds: activeDocumentIds.map((id) => id as Id<'uploadedFiles'>),
        evidenceGenerationIds: Array.from(new Set([
          ...existingTask.evidenceGenerationIds.map(String),
          ...startingControl.activeEvidenceGenerationIds,
        ])).map((id) => id as Id<'documentMemoryGenerations'>),
        latestTurnId: args.turnId,
        updatedAt: args.now,
      });
    }
  }

  if (!taskId) {
    throw new Error('conversation_task_resolution_failed');
  }

  const understandingId = await ctx.db.insert('turnUnderstandings', {
    turnId: args.turnId,
    conversationId: args.conversation._id,
    userId: args.userId,
    schemaVersion: 1,
    speechAct: understanding.speechAct,
    continuity: understanding.continuity,
    requestedOperation: understanding.requestedOperation,
    interactionIntent: understanding.interactionIntent,
    interactionCandidateOptionIds: understanding.interactionCandidateOptionIds,
    interactionClassifierVersion: understanding.interactionIntent ? 'semantic-interaction-v1' : undefined,
    interactionConfidence: understanding.interactionConfidence,
    interactionReasonCodes: understanding.interactionReasonCodes,
    referentsJson: JSON.stringify(understanding.referents),
    candidateTasksJson: JSON.stringify(understanding.candidateTasks),
    confidence: understanding.confidence,
    ambiguityMaterial: understanding.ambiguityMaterial,
    reasonCodes: understanding.reasonCodes,
    resolverVersion: understanding.resolverVersion,
    createdAt: args.now,
  });

  const hasPendingDocumentAction = Boolean(
    startingControl.pendingOptions.some((option) => option.documentIds.length > 0) ||
    startingControl.lastAssistantOffer?.documentIds.length
  );
  const documentActivation = executiveChatFlags.documentActivationV2
    ? decideDocumentActivation({
        message: args.message,
        speechAct: understanding.speechAct,
        requestedOperation: understanding.requestedOperation,
        detection: detectDocumentReference(args.message),
        pendingAct: startingControl.pendingAct,
        hasCurrentAttachments: args.attachmentDocumentIds.length > 0,
        hasActiveDocumentContext: activeDocumentIds.length > 0,
        hasPendingDocumentAction,
      })
    : {
        active: activeDocumentIds.length > 0,
        preserveFocus: true,
        source: activeDocumentIds.length > 0 ? 'pending_action' as const : 'none' as const,
        referenceStrength: activeDocumentIds.length > 0 ? 'carried' as const : 'none' as const,
        useCurrentAttachmentsOnly: false,
        reasonCodes: ['legacy_document_activation_v1'],
      };
  const plan = buildExecutionPlan({
    message: args.message,
    understanding,
    transition,
    taskId,
    focusRevision,
    routeMode: args.routeMode,
    activeDocumentIds,
    attachmentDocumentIds: args.attachmentDocumentIds.map(String),
    documentActivation,
    resolvedOption,
    interactionResolutionId: interactionResolution?.resolutionId,
    activeEvidenceGenerationIds: startingControl.activeEvidenceGenerationIds,
  });
  const consumesPendingInteraction = transition.kind === 'refine' &&
    ['select', 'confirm', 'cancel'].includes(understanding.speechAct);
  const awaitedUploadArrived = startingControl.pendingAct === 'await_upload' && args.attachmentDocumentIds.length > 0;
  const startsAwaitingUpload = executiveChatFlags.documentActivationV2 && understanding.requestedOperation === 'await_upload';
  const expiresPendingInteraction = transition.kind === 'replace' || consumesPendingInteraction || awaitedUploadArrived;
  const selectedDocumentIds = plan.selectedDocumentIds.map((id) => id as Id<'uploadedFiles'>);
  const executionPlanId = await ctx.db.insert('turnExecutionPlans', {
    planId: plan.planId,
    turnId: args.turnId,
    conversationId: args.conversation._id,
    userId: args.userId,
    schemaVersion: 1,
    focusRevision,
    taskId,
    responseAct: plan.responseAct,
    routeMode: plan.routeMode,
    selectedDocumentIds,
    evidenceRequirements: plan.evidenceRequirements,
    retrievalQueries: plan.retrievalQueries,
    capabilityRequirements: plan.capabilityRequirements,
    fallbackOrder: plan.fallbackOrder,
    questionContractJson: JSON.stringify({ kind: plan.questionKind }),
    interactionResolutionId: plan.interactionResolutionId,
    selectedOptionId: plan.selectedOptionId,
    requestedOperation: plan.requestedOperation,
    analysisMode: plan.analysisMode,
    selectedEvidenceGenerationIds: plan.selectedEvidenceGenerationIds?.map((id) => id as Id<'documentMemoryGenerations'>),
    interactionContractHash: plan.interactionContractHash,
    documentActivationJson: JSON.stringify(documentActivation),
    status: 'planned',
    plannerVersion: understanding.resolverVersion,
    createdAt: args.now,
    updatedAt: args.now,
  });

  const controlPatch = {
    schemaVersion: 1 as const,
    focusRevision,
    activeTaskId: taskId,
    activeTaskKind,
    activeIssueKey: startingControl.activeIssueKey,
    activeDocumentIds: activeDocumentIds.map((id) => id as Id<'uploadedFiles'>),
    activeEvidenceGenerationIds: startingControl.activeEvidenceGenerationIds.map((id) => id as Id<'documentMemoryGenerations'>),
    parentTaskId,
    pendingAct: startsAwaitingUpload
      ? 'await_upload' as const
      : transition.kind === 'clarify'
      ? 'clarify' as const
      : expiresPendingInteraction
        ? undefined
        : startingControl.pendingAct,
    pendingOptionsJson: JSON.stringify(startsAwaitingUpload || expiresPendingInteraction ? [] : startingControl.pendingOptions),
    pendingSourceTurnId: startsAwaitingUpload
      ? args.turnId
      : expiresPendingInteraction
        ? undefined
        : loaded.row?.pendingSourceTurnId,
    lastAssistantOfferJson: startsAwaitingUpload || expiresPendingInteraction
      ? undefined
      : startingControl.lastAssistantOffer
        ? JSON.stringify(startingControl.lastAssistantOffer)
        : undefined,
    pendingInteractionVersion: startsAwaitingUpload
      ? undefined
      : expiresPendingInteraction
        ? undefined
        : startingControl.pendingInteractionVersion,
    activeRecommendationJson: startsAwaitingUpload || expiresPendingInteraction
      ? undefined
      : startingControl.activeRecommendation
        ? JSON.stringify(startingControl.activeRecommendation)
        : undefined,
    lastInteractionResolutionId: interactionResolution?.resolutionId ?? startingControl.lastInteractionResolutionId,
    lastResolvedReferentsJson: JSON.stringify(understanding.referents),
    confidence: understanding.confidence,
    provenance: loaded.row ? loaded.row.provenance : startingControl.provenance,
    updatedAt: args.now,
  };
  if (loaded.row) {
    if (loaded.row.focusRevision !== startingControl.focusRevision) throw new Error('focus_revision_conflict');
    await ctx.db.patch(loaded.row._id, controlPatch);
  } else {
    await ctx.db.insert('conversationControlStates', {
      conversationId: args.conversation._id,
      userId: args.userId,
      caseId: args.conversation.caseId,
      ...controlPatch,
      createdAt: args.now,
    });
  }

  if (interactionResolution) {
    const safeDocumentIds = interactionResolution.documentIds.filter((id) => activeDocumentIds.includes(id));
    const safeEvidenceGenerationIds = interactionResolution.evidenceGenerationIds.filter((id) =>
      startingControl.activeEvidenceGenerationIds.includes(id)
    );
    const executeAuthorized = interactionResolution.decision !== 'execute' || (
      safeDocumentIds.length === interactionResolution.documentIds.length &&
      safeEvidenceGenerationIds.length === interactionResolution.evidenceGenerationIds.length &&
      resolvedOption?.targetTaskId === taskId
    );
    await ctx.db.insert('interactionResolutionAudits', {
      resolutionId: interactionResolution.resolutionId,
      conversationId: args.conversation._id,
      userId: args.userId,
      turnId: args.turnId,
      interactionId: resolvedOption?.interactionId,
      recommendationId: interactionResolution.recommendationId,
      candidateOptionIds: interactionResolution.candidateOptionIds,
      selectedOptionId: executeAuthorized ? interactionResolution.selectedOptionId : undefined,
      intent: interactionResolution.intent,
      decision: executeAuthorized ? interactionResolution.decision : 'rejected',
      confidence: interactionResolution.confidence,
      reasonCodes: executeAuthorized
        ? interactionResolution.reasonCodes
        : [...interactionResolution.reasonCodes, 'interaction_authorization_failed'],
      classifierVersion: 'semantic-interaction-v1',
      arbiterVersion: 'semantic-arbiter-v1',
      taskId,
      documentIds: safeDocumentIds.map((id) => id as Id<'uploadedFiles'>),
      evidenceGenerationIds: safeEvidenceGenerationIds.map((id) => id as Id<'documentMemoryGenerations'>),
      operationJson: executeAuthorized && interactionResolution.operation
        ? JSON.stringify(interactionResolution.operation)
        : undefined,
      authorizationScopeHash: resolvedOption?.authorizationScopeHash ?? `scope_${args.userId}_${args.conversation._id}`,
      createdAt: args.now,
    });
  }

  return { understanding, transition, plan, focusRevision, taskId, understandingId, executionPlanId };
}

export const getForConversation = query({
  args: { conversationId: v.id('conversations') },
  handler: async (ctx, args) => {
    const { user } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
    const loaded = await loadConversationControlContext(ctx, { conversationId: args.conversationId, userId: user._id });
    return { controlState: loaded.controlState ?? null, tasks: loaded.tasks };
  },
});

/** Authorized, redacted decision timeline for support diagnostics. */
export const getDecisionTimeline = query({
  args: { conversationId: v.id('conversations'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
    const turns = await ctx.db.query('chatTurns')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(limit);
    return Promise.all(turns.reverse().map(async (turn) => {
      if (turn.userId !== user._id) throw new Error('turn_scope_mismatch');
      const [understanding, plan, audit, interactionResolution] = await Promise.all([
        ctx.db.query('turnUnderstandings').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
        ctx.db.query('turnExecutionPlans').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
        ctx.db.query('responsePublicationAudits').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).order('desc').first(),
        ctx.db.query('interactionResolutionAudits').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).order('desc').first(),
      ]);
      return {
        turnId: turn._id,
        correlationId: turn.requestId,
        status: turn.status,
        taskId: turn.taskId,
        planId: plan?.planId,
        focusRevision: turn.focusRevision,
        speechAct: understanding?.speechAct,
        continuity: understanding?.continuity,
        reasonCodes: understanding?.reasonCodes ?? [],
        interactionIntent: understanding?.interactionIntent,
        interactionConfidence: understanding?.interactionConfidence,
        interactionDecision: interactionResolution?.decision,
        interactionResolutionReasonCodes: interactionResolution?.reasonCodes ?? [],
        resolverVersion: understanding?.resolverVersion,
        selectedDocumentCount: plan?.selectedDocumentIds.length ?? 0,
        selectedOptionId: plan?.selectedOptionId,
        analysisMode: plan?.analysisMode,
        selectedEvidenceGenerationCount: plan?.selectedEvidenceGenerationIds?.length ?? 0,
        documentActivation: parseJsonObject<{
          active: boolean;
          source: string;
          referenceStrength: string;
          reasonCodes: string[];
        }>(plan?.documentActivationJson),
        evidenceRequirementCount: plan?.evidenceRequirements.length ?? 0,
        publicationDecision: audit?.decision,
        publicationRejectionCodes: audit?.rejectionCodes ?? [],
        validatorVersion: audit?.validatorVersion,
        createdAt: turn.createdAt,
        completedAt: turn.completedAt,
      };
    }));
  },
});

/** Additive, idempotent backfill for conversations created before control-state v1. */
export const backfillLegacyConversations = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    const page = await ctx.db.query('conversations').paginate({ cursor: args.cursor, numItems });
    let created = 0;
    let skipped = 0;
    let withoutTurn = 0;
    const now = Date.now();

    for (const conversation of page.page) {
      const existing = await ctx.db.query('conversationControlStates')
        .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
        .first();
      if (existing) {
        skipped += 1;
        continue;
      }
      const [latestTurn, issue, documentState] = await Promise.all([
        ctx.db.query('chatTurns')
          .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
          .order('desc')
          .first(),
        ctx.db.query('conversationLegalIssueState')
          .withIndex('by_conversation_status', (q) => q.eq('conversationId', conversation._id).eq('status', 'focused'))
          .order('desc')
          .first(),
        ctx.db.query('conversationDocumentState')
          .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
          .first(),
      ]);
      if (!latestTurn || latestTurn.userId !== conversation.userId) {
        withoutTurn += 1;
        continue;
      }
      const documentIds = Array.from(new Map([
        ...(documentState?.activeUploadedFileId ? [[documentState.activeUploadedFileId.toString(), documentState.activeUploadedFileId] as const] : []),
        ...(documentState?.lastReferencedUploadedFileIds ?? []).map((id) => [id.toString(), id] as const),
        ...(issue?.sourceAnchors ?? []).map((anchor) => [anchor.uploadedFileId.toString(), anchor.uploadedFileId] as const),
      ]).values());
      const taskId = `migrated_${conversation._id}`;
      const goal = issue?.userQuestion?.trim() || latestTurn.message.trim() || 'Continue the current conversation';
      const kind = documentIds.length > 0
        ? 'document_review' as const
        : latestTurn.routeMode === 'court_ready_drafting' || latestTurn.routeMode === 'party_message_draft'
          ? 'draft' as const
          : latestTurn.routeMode === 'local_procedure' || latestTurn.routeMode === 'filing_walkthrough'
            ? 'procedure' as const
            : 'general' as const;
      if (!args.dryRun) {
        await ctx.db.insert('conversationTasks', {
          conversationId: conversation._id,
          userId: conversation.userId,
          caseId: conversation.caseId,
          taskId,
          kind,
          status: 'active',
          goal: goal.slice(0, 1_500),
          normalizedGoal: goal.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 1_500),
          issueKey: issue?.issueKey,
          documentIds,
          evidenceGenerationIds: [],
          originatingTurnId: latestTurn._id,
          latestTurnId: latestTurn._id,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert('conversationControlStates', {
          conversationId: conversation._id,
          userId: conversation.userId,
          caseId: conversation.caseId,
          schemaVersion: 1,
          focusRevision: 0,
          activeTaskId: taskId,
          activeTaskKind: kind,
          activeIssueKey: issue?.issueKey,
          activeDocumentIds: documentIds,
          activeEvidenceGenerationIds: [],
          pendingOptionsJson: JSON.stringify([]),
          confidence: issue ? 0.6 : 0.4,
          provenance: issue ? 'migrated_issue' : 'migrated_route',
          createdAt: now,
          updatedAt: now,
        });
      }
      created += 1;
    }

    return {
      scanned: page.page.length,
      created,
      skipped,
      withoutTurn,
      dryRun: args.dryRun ?? false,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getForTurnInternal = internalQuery({
  args: { turnId: v.id('chatTurns') },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) return null;
    const [control, understanding, plan] = await Promise.all([
      ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId)).first(),
      ctx.db.query('turnUnderstandings').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
      ctx.db.query('turnExecutionPlans').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
    ]);
    if (control?.userId !== turn.userId || understanding?.userId !== turn.userId || plan?.userId !== turn.userId) {
      throw new Error('orchestration_scope_mismatch');
    }
    return { control, understanding, plan };
  },
});

/**
 * Apply a model-assisted semantic decision after deterministic resolution was
 * inconclusive. The mutation is the authorization boundary: the classifier
 * supplies IDs only, and this code rebinds them to current trusted state.
 */
export const applySemanticClassifierResolution = internalMutation({
  args: {
    turnId: v.id('chatTurns'),
    resolutionId: v.string(),
    selectedOptionId: v.string(),
    recommendationId: v.optional(v.string()),
    intent: v.string(),
    confidence: v.number(),
    reasonCodes: v.array(v.string()),
    classifierVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn || turn.status !== 'queued') throw new Error('classifier_turn_not_executable');
    const executableIntents: InteractionIntent[] = ['accept_recommendation', 'accept_offer', 'select_option'];
    if (!executableIntents.includes(args.intent as InteractionIntent)) throw new Error('classifier_intent_not_executable');
    const interactionIntent = args.intent as InteractionIntent;
    const [owner, control, understanding, plan] = await Promise.all([
      ctx.db.get(turn.userId),
      ctx.db.query('conversationControlStates').withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId)).first(),
      ctx.db.query('turnUnderstandings').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
      ctx.db.query('turnExecutionPlans').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
    ]);
    if (!owner?.clerkId || !control || !understanding || !plan || control.userId !== turn.userId || understanding.userId !== turn.userId || plan.userId !== turn.userId) {
      throw new Error('classifier_resolution_scope_mismatch');
    }
    if (plan.status !== 'planned' || plan.focusRevision !== control.focusRevision || !['clarify', 'unknown'].includes(understanding.speechAct)) {
      throw new Error('classifier_resolution_state_changed');
    }
    const options = parseJsonArray<PendingOption>(control.pendingOptionsJson);
    const option = options.find((candidate) => candidate.optionId === args.selectedOptionId);
    const recommendation = parseJsonObject<RecommendationReceipt>(control.activeRecommendationJson);
    if (!option || option.targetTaskId !== control.activeTaskId || option.targetTaskId !== plan.taskId ||
        option.expiresAfterFocusRevision < control.focusRevision || option.consumedAt !== undefined || option.cancelledAt !== undefined) {
      throw new Error('classifier_option_not_current');
    }
    if (interactionIntent === 'accept_recommendation' && (
      !recommendation || recommendation.recommendedOptionId !== option.optionId ||
      recommendation.recommendationId !== args.recommendationId || recommendation.focusRevision !== control.focusRevision
    )) {
      throw new Error('classifier_recommendation_not_current');
    }
    const activeDocumentIds = new Set(control.activeDocumentIds.map(String));
    const activeEvidenceGenerationIds = new Set(control.activeEvidenceGenerationIds.map(String));
    if (option.documentIds.some((id) => !activeDocumentIds.has(id)) ||
        (option.evidenceGenerationIds ?? []).some((id) => !activeEvidenceGenerationIds.has(id))) {
      throw new Error('classifier_option_binding_not_authorized');
    }
    const evidenceGenerations = await Promise.all((option.evidenceGenerationIds ?? []).map((id) => ctx.db.get(id as Id<'documentMemoryGenerations'>)));
    if (evidenceGenerations.some((generation) => !generation || generation.clerkUserId !== owner.clerkId ||
        generation.status !== 'active' || !option.documentIds.includes(generation.uploadedFileId.toString()))) {
      throw new Error('classifier_evidence_generation_not_current');
    }
    const requestedOperation = option.operation?.kind ?? understanding.requestedOperation;
    const analysisMode = option.operation?.kind === 'document_review' ? option.operation.analysisMode : undefined;
    const selectedDocumentIds = option.documentIds.map((id) => id as Id<'uploadedFiles'>);
    const selectedEvidenceGenerationIds = (option.evidenceGenerationIds ?? []).map((id) => id as Id<'documentMemoryGenerations'>);
    const now = Date.now();
    await ctx.db.patch(understanding._id, {
      speechAct: interactionIntent === 'accept_recommendation' || interactionIntent === 'accept_offer' ? 'confirm' : 'select',
      continuity: 'same_task',
      requestedOperation,
      interactionIntent,
      interactionCandidateOptionIds: options.map((candidate) => candidate.optionId),
      interactionClassifierVersion: args.classifierVersion,
      interactionConfidence: args.confidence,
      interactionReasonCodes: args.reasonCodes,
      referentsJson: JSON.stringify([{ raw: turn.message, resolvedType: 'option', resolvedId: option.optionId, confidence: args.confidence }]),
      confidence: Math.max(understanding.confidence, args.confidence),
      ambiguityMaterial: false,
      reasonCodes: Array.from(new Set([...understanding.reasonCodes, ...args.reasonCodes, 'semantic_classifier_authorized'])),
    });
    await ctx.db.patch(plan._id, {
      responseAct: interactionIntent === 'accept_recommendation' || interactionIntent === 'accept_offer' ? 'confirm' : 'answer',
      selectedDocumentIds,
      evidenceRequirements: selectedDocumentIds.length > 0 ? ['authorized_document', 'relevant_source_unit'] : [],
      retrievalQueries: selectedDocumentIds.length > 0 ? [turn.message.trim().slice(0, 2_000)] : [],
      capabilityRequirements: selectedDocumentIds.length > 0 ? ['document_metadata', 'scoped_text_or_chunks'] : [],
      interactionResolutionId: args.resolutionId,
      selectedOptionId: option.optionId,
      requestedOperation,
      analysisMode,
      selectedEvidenceGenerationIds,
      interactionContractHash: `classifier:${args.resolutionId}:${option.optionId}`,
      documentActivationJson: JSON.stringify({
        active: selectedDocumentIds.length > 0,
        preserveFocus: true,
        source: 'resolved_pending_action',
        referenceStrength: 'carried',
        useCurrentAttachmentsOnly: false,
        reasonCodes: ['semantic_acceptance_resolved', 'pending_option_authorized'],
      }),
      updatedAt: now,
    });
    await ctx.db.patch(turn._id, { analysisMode, taskId: plan.taskId, focusRevision: plan.focusRevision, updatedAt: now });
    await ctx.db.patch(control._id, {
      pendingAct: undefined,
      pendingOptionsJson: JSON.stringify([]),
      pendingSourceTurnId: undefined,
      lastAssistantOfferJson: undefined,
      pendingInteractionVersion: undefined,
      activeRecommendationJson: undefined,
      lastInteractionResolutionId: args.resolutionId,
      confidence: Math.max(control.confidence, args.confidence),
      updatedAt: now,
    });
    await ctx.db.insert('interactionResolutionAudits', {
      resolutionId: args.resolutionId,
      conversationId: turn.conversationId,
      userId: turn.userId,
      turnId: turn._id,
      interactionId: option.interactionId,
      recommendationId: args.recommendationId,
      candidateOptionIds: options.map((candidate) => candidate.optionId),
      selectedOptionId: option.optionId,
      intent: interactionIntent,
      decision: 'execute',
      confidence: args.confidence,
      reasonCodes: args.reasonCodes,
      classifierVersion: args.classifierVersion,
      arbiterVersion: 'semantic-arbiter-v1',
      taskId: option.targetTaskId,
      documentIds: selectedDocumentIds,
      evidenceGenerationIds: selectedEvidenceGenerationIds,
      operationJson: option.operation ? JSON.stringify(option.operation) : undefined,
      authorizationScopeHash: option.authorizationScopeHash ?? `scope_${turn.userId}_${turn.conversationId}`,
      createdAt: now,
    });
    return { applied: true };
  },
});

/** Record a non-executing classifier result or provider fallback for tuning. */
export const recordSemanticClassifierFallback = internalMutation({
  args: {
    turnId: v.id('chatTurns'),
    resolutionId: v.string(),
    intent: v.string(),
    decision: v.union(v.literal('clarify'), v.literal('cancel'), v.literal('defer'), v.literal('unrelated'), v.literal('rejected')),
    candidateOptionIds: v.array(v.string()),
    recommendationId: v.optional(v.string()),
    confidence: v.number(),
    reasonCodes: v.array(v.string()),
    classifierVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) throw new Error('classifier_turn_not_found');
    const control = await ctx.db.query('conversationControlStates')
      .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId)).first();
    if (!control || control.userId !== turn.userId) throw new Error('classifier_fallback_scope_mismatch');
    const knownOptionIds = new Set(parseJsonArray<PendingOption>(control.pendingOptionsJson).map((option) => option.optionId));
    const candidateOptionIds = args.candidateOptionIds.filter((id) => knownOptionIds.has(id));
    const validIntents: InteractionIntent[] = [
      'accept_recommendation', 'accept_offer', 'select_option', 'reject_recommendation',
      'reject_option', 'modify_option', 'cancel_action', 'defer_action', 'ask_about_options',
      'unrelated_turn', 'uncertain',
    ];
    const intent = validIntents.includes(args.intent as InteractionIntent)
      ? args.intent as InteractionIntent
      : 'uncertain';
    const existing = await ctx.db.query('interactionResolutionAudits')
      .withIndex('by_turn', (q) => q.eq('turnId', turn._id)).collect();
    if (existing.some((audit) => audit.resolutionId === args.resolutionId)) return { recorded: false };
    await ctx.db.insert('interactionResolutionAudits', {
      resolutionId: args.resolutionId,
      conversationId: turn.conversationId,
      userId: turn.userId,
      turnId: turn._id,
      recommendationId: args.recommendationId,
      candidateOptionIds,
      intent,
      decision: args.decision,
      confidence: Math.max(0, Math.min(1, args.confidence)),
      reasonCodes: args.reasonCodes.slice(0, 12),
      classifierVersion: args.classifierVersion,
      arbiterVersion: 'semantic-arbiter-v1',
      taskId: control.activeTaskId,
      documentIds: [],
      evidenceGenerationIds: [],
      authorizationScopeHash: `scope_${turn.userId}_${turn.conversationId}`,
      createdAt: Date.now(),
    });
    return { recorded: true };
  },
});

export const applyValidatedPendingState = internalMutation({
  args: {
    turnId: v.id('chatTurns'),
    pendingAct: v.optional(v.union(
      v.literal('select'), v.literal('confirm'), v.literal('continue'),
      v.literal('clarify'), v.literal('supply_detail'), v.literal('await_upload')
    )),
    pendingOptionsJson: v.optional(v.string()),
    assistantOfferJson: v.optional(v.string()),
    recommendationJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) throw new Error('turn_not_found');
    const control = await ctx.db.query('conversationControlStates')
      .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
      .first();
    if (!control || control.userId !== turn.userId) throw new Error('conversation_control_scope_mismatch');
    const options = parseJsonArray<PendingOption>(args.pendingOptionsJson);
    if (options.some((option) =>
      option.targetTaskId !== control.activeTaskId ||
      option.expiresAfterFocusRevision < control.focusRevision ||
      option.documentIds.some((id) => !control.activeDocumentIds.some((activeId) => activeId.toString() === id)) ||
      (option.evidenceGenerationIds ?? []).some((id) => !control.activeEvidenceGenerationIds.some((activeId) => activeId.toString() === id))
    )) {
      throw new Error('invalid_pending_option_scope');
    }
    const recommendation = parseJsonObject<RecommendationReceipt>(args.recommendationJson);
    if (recommendation && (
      recommendation.targetTaskId !== control.activeTaskId ||
      recommendation.focusRevision !== control.focusRevision ||
      !options.some((option) => option.optionId === recommendation.recommendedOptionId)
    )) {
      throw new Error('invalid_recommendation_scope');
    }
    await ctx.db.patch(control._id, {
      pendingAct: args.pendingAct,
      pendingOptionsJson: args.pendingOptionsJson,
      pendingSourceTurnId: args.pendingAct ? turn._id : undefined,
      lastAssistantOfferJson: args.assistantOfferJson,
      pendingInteractionVersion: options.some((option) => option.schemaVersion === 2) ? 2 : undefined,
      activeRecommendationJson: args.recommendationJson,
      updatedAt: Date.now(),
    });
  },
});

export type PersistedTurnOrchestration = {
  understanding: TurnUnderstanding;
  plan: TurnExecutionPlan;
};

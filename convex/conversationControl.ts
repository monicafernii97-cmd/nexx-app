import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthenticatedUserAndConversation } from './lib/auth';
import type { RouteMode } from '../src/lib/types';
import { understandTurn } from '../src/lib/nexx/orchestration/turnUnderstanding';
import { decideFocusTransition } from '../src/lib/nexx/orchestration/focusTransition';
import { buildExecutionPlan } from '../src/lib/nexx/orchestration/executionPlan';
import type {
  AssistantOffer,
  ConversationControlSnapshot,
  ConversationTaskSnapshot,
  PendingOption,
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
  return {
    row: controlRow,
    controlState: controlSnapshot(controlRow),
    tasks: taskRows.map(taskSnapshot),
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
}) {
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
  });
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
      evidenceGenerationIds: [],
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
    referentsJson: JSON.stringify(understanding.referents),
    candidateTasksJson: JSON.stringify(understanding.candidateTasks),
    confidence: understanding.confidence,
    ambiguityMaterial: understanding.ambiguityMaterial,
    reasonCodes: understanding.reasonCodes,
    resolverVersion: understanding.resolverVersion,
    createdAt: args.now,
  });

  const plan = buildExecutionPlan({
    message: args.message,
    understanding,
    transition,
    taskId,
    focusRevision,
    routeMode: args.routeMode,
    activeDocumentIds,
  });
  const consumesPendingInteraction = transition.kind === 'refine' &&
    ['select', 'confirm', 'cancel'].includes(understanding.speechAct);
  const expiresPendingInteraction = transition.kind === 'replace' || consumesPendingInteraction;
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
    pendingAct: transition.kind === 'clarify'
      ? 'clarify' as const
      : expiresPendingInteraction
        ? undefined
        : startingControl.pendingAct,
    pendingOptionsJson: JSON.stringify(expiresPendingInteraction ? [] : startingControl.pendingOptions),
    lastAssistantOfferJson: expiresPendingInteraction
      ? undefined
      : startingControl.lastAssistantOffer
        ? JSON.stringify(startingControl.lastAssistantOffer)
        : undefined,
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
      const [understanding, plan, audit] = await Promise.all([
        ctx.db.query('turnUnderstandings').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
        ctx.db.query('turnExecutionPlans').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).first(),
        ctx.db.query('responsePublicationAudits').withIndex('by_turn', (q) => q.eq('turnId', turn._id)).order('desc').first(),
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
        resolverVersion: understanding?.resolverVersion,
        selectedDocumentCount: plan?.selectedDocumentIds.length ?? 0,
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

export const applyValidatedPendingState = internalMutation({
  args: {
    turnId: v.id('chatTurns'),
    pendingAct: v.optional(v.union(
      v.literal('select'), v.literal('confirm'), v.literal('continue'),
      v.literal('clarify'), v.literal('supply_detail')
    )),
    pendingOptionsJson: v.optional(v.string()),
    assistantOfferJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) throw new Error('turn_not_found');
    const control = await ctx.db.query('conversationControlStates')
      .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
      .first();
    if (!control || control.userId !== turn.userId) throw new Error('conversation_control_scope_mismatch');
    const options = parseJsonArray<PendingOption>(args.pendingOptionsJson);
    if (options.some((option) => option.targetTaskId !== control.activeTaskId || option.expiresAfterFocusRevision < control.focusRevision)) {
      throw new Error('invalid_pending_option_scope');
    }
    await ctx.db.patch(control._id, {
      pendingAct: args.pendingAct,
      pendingOptionsJson: args.pendingOptionsJson,
      pendingSourceTurnId: args.pendingAct ? turn._id : undefined,
      lastAssistantOfferJson: args.assistantOfferJson,
      updatedAt: Date.now(),
    });
  },
});

export type PersistedTurnOrchestration = {
  understanding: TurnUnderstanding;
  plan: TurnExecutionPlan;
};

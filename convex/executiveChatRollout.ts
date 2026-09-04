import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';
import { CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT } from '../src/lib/nexx/releaseContract';
import {
  EXECUTIVE_CHAT_ROLLOUT_FEATURES,
  resolveExecutiveChatRollout,
  type ExecutiveChatRolloutConfigSnapshot,
  type ExecutiveChatRolloutFeature,
  type ExecutiveChatRolloutMode,
  type ExecutiveChatRolloutSubject,
} from '../src/lib/nexx/orchestration/rollout';

const environmentValidator = v.union(v.literal('preview'), v.literal('production'));
const modeValidator = v.union(v.literal('off'), v.literal('shadow'), v.literal('enforce'));
const featureModesValidator = v.object({
  foreground_intent_v2: modeValidator,
  document_activation_v2: modeValidator,
  publication_v2: modeValidator,
  self_correction_v1: modeValidator,
  qa_provenance_v1: modeValidator,
  understanding_resume_v2: modeValidator,
});

function requireReleaseSecret(secret: string) {
  const expected = process.env.VERIFICATION_SECRET;
  if (!expected || secret !== expected) throw new Error('rollout_not_authorized');
}

function normalizeIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function fallbackConfig(environment: 'preview' | 'production'): ExecutiveChatRolloutConfigSnapshot {
  const featureModes = Object.fromEntries(EXECUTIVE_CHAT_ROLLOUT_FEATURES.map((feature) => [
    feature,
    environment === 'preview'
      ? 'enforce'
      : feature === 'qa_provenance_v1' || feature === 'understanding_resume_v2'
        ? 'enforce'
        : feature === 'self_correction_v1'
          ? 'off'
          : 'shadow',
  ])) as Record<ExecutiveChatRolloutFeature, ExecutiveChatRolloutMode>;
  return {
    version: 0,
    environment,
    featureModes,
    defaultMode: environment === 'preview' ? 'enforce' : 'off',
    cohortPercentage: 100,
    allowlistedUserIds: [], allowlistedOrgIds: [], allowlistedCaseIds: [], allowlistedConversationIds: [],
    denylistedUserIds: [], denylistedOrgIds: [], denylistedCaseIds: [], denylistedConversationIds: [],
    cohortSalt: 'safe-bootstrap', activationStartsAt: 0, emergencyDisabled: false,
  };
}

function asSnapshot(row: {
  version: number; environment: 'preview' | 'production'; featureModesJson: string;
  defaultMode: ExecutiveChatRolloutMode; cohortPercentage: number; allowlistedUserIds: string[];
  allowlistedOrgIds: string[]; allowlistedCaseIds: string[]; allowlistedConversationIds: string[];
  denylistedUserIds: string[]; denylistedOrgIds: string[]; denylistedCaseIds: string[];
  denylistedConversationIds: string[]; cohortSalt: string; activationStartsAt: number;
  expiresAt?: number; emergencyDisabled: boolean;
}): ExecutiveChatRolloutConfigSnapshot {
  const parsed = JSON.parse(row.featureModesJson) as Record<ExecutiveChatRolloutFeature, ExecutiveChatRolloutMode>;
  for (const feature of EXECUTIVE_CHAT_ROLLOUT_FEATURES) {
    if (!['off', 'shadow', 'enforce'].includes(parsed[feature])) throw new Error('rollout_feature_modes_invalid');
  }
  return { ...row, featureModes: parsed };
}

export async function resolveRolloutForSubject(
  ctx: MutationCtx | QueryCtx,
  subject: ExecutiveChatRolloutSubject,
  environment = (process.env.EXEC_CHAT_ENVIRONMENT === 'preview' ? 'preview' : 'production') as 'preview' | 'production',
) {
  const row = await ctx.db.query('executiveChatRolloutConfigs')
    .withIndex('by_environment_status', (q) => q.eq('environment', environment).eq('status', 'active'))
    .order('desc')
    .first();
  const config = row ? asSnapshot(row) : fallbackConfig(environment);
  const decision = resolveExecutiveChatRollout({
    config,
    subject,
    now: Date.now(),
    globalEmergencyOff: ['1', 'true', 'on', 'yes'].includes((process.env.EXEC_CHAT_EMERGENCY_OFF ?? '').toLowerCase()),
  });
  if (subject.qaSynthetic && !['emergency_off', 'denylist'].includes(decision.selectionReason)) {
    return {
      ...decision,
      modes: Object.fromEntries(EXECUTIVE_CHAT_ROLLOUT_FEATURES.map((feature) => [feature, 'enforce'])) as typeof decision.modes,
      selected: true,
      selectionReason: 'allowlist' as const,
    };
  }
  return decision;
}

const listFields = {
  allowlistedUserIds: v.array(v.string()), allowlistedOrgIds: v.array(v.string()),
  allowlistedCaseIds: v.array(v.string()), allowlistedConversationIds: v.array(v.string()),
  denylistedUserIds: v.array(v.string()), denylistedOrgIds: v.array(v.string()),
  denylistedCaseIds: v.array(v.string()), denylistedConversationIds: v.array(v.string()),
};

export const propose = mutation({
  args: {
    secret: v.string(), environment: environmentValidator, featureModes: featureModesValidator,
    defaultMode: modeValidator, cohortPercentage: v.number(), cohortSalt: v.string(),
    activationStartsAt: v.number(), expiresAt: v.optional(v.number()), emergencyDisabled: v.boolean(),
    creator: v.string(), reason: v.string(), changeTicket: v.string(), idempotencyKey: v.string(),
    ...listFields,
  },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    if (!args.creator.trim() || args.reason.trim().length < 12 || !args.changeTicket.trim() || !args.idempotencyKey.trim()) throw new Error('rollout_change_metadata_invalid');
    if (args.cohortPercentage < 0 || args.cohortPercentage > 100 || !args.cohortSalt.trim()) throw new Error('rollout_cohort_invalid');
    if (args.expiresAt !== undefined && args.expiresAt <= args.activationStartsAt) throw new Error('rollout_window_invalid');
    const existing = await ctx.db.query('executiveChatRolloutConfigs').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', args.idempotencyKey)).first();
    if (existing) return { configId: existing._id, version: existing.version, duplicate: true };
    const latest = await ctx.db.query('executiveChatRolloutConfigs').withIndex('by_environment_version', (q) => q.eq('environment', args.environment)).order('desc').first();
    const version = (latest?.version ?? 0) + 1;
    const now = Date.now();
    const { secret: _secret, featureModes, ...rest } = args;
    void _secret;
    const configId = await ctx.db.insert('executiveChatRolloutConfigs', {
      ...rest,
      allowlistedUserIds: normalizeIds(args.allowlistedUserIds),
      allowlistedOrgIds: normalizeIds(args.allowlistedOrgIds),
      allowlistedCaseIds: normalizeIds(args.allowlistedCaseIds),
      allowlistedConversationIds: normalizeIds(args.allowlistedConversationIds),
      denylistedUserIds: normalizeIds(args.denylistedUserIds),
      denylistedOrgIds: normalizeIds(args.denylistedOrgIds),
      denylistedCaseIds: normalizeIds(args.denylistedCaseIds),
      denylistedConversationIds: normalizeIds(args.denylistedConversationIds),
      version, status: 'draft', featureModesJson: JSON.stringify(featureModes),
      schemaVersion: CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT.schemaVersion,
      controlVersion: CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT.controlVersion,
      capabilityVersion: CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT.capabilityVersion,
      validatorVersion: CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT.validatorVersion,
      promptPolicyVersion: CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT.promptPolicyVersion,
      createdAt: now, updatedAt: now,
    });
    await ctx.db.insert('executiveChatRolloutEvents', { configId, configVersion: version, environment: args.environment, eventType: 'proposed', actor: args.creator, reason: args.reason, changeTicket: args.changeTicket, detailJson: JSON.stringify({ cohortPercentage: args.cohortPercentage }), createdAt: now });
    return { configId, version, duplicate: false };
  },
});

export const approve = mutation({
  args: { secret: v.string(), configId: v.id('executiveChatRolloutConfigs'), approver: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    const config = await ctx.db.get(args.configId);
    if (!config || config.status !== 'draft') throw new Error('rollout_config_not_draft');
    if (!args.approver.trim() || args.approver === config.creator || args.reason.trim().length < 12) throw new Error('rollout_approval_invalid');
    const now = Date.now();
    await ctx.db.patch(config._id, { status: 'approved', approver: args.approver, approvedAt: now, updatedAt: now });
    await ctx.db.insert('executiveChatRolloutEvents', { configId: config._id, configVersion: config.version, environment: config.environment, eventType: 'approved', actor: args.approver, reason: args.reason, changeTicket: config.changeTicket, detailJson: '{}', createdAt: now });
    return { approved: true, version: config.version };
  },
});

async function activeReleasePair(ctx: MutationCtx, environment: 'preview' | 'production') {
  const manifests = await ctx.db.query('releaseManifests').withIndex('by_environment_active', (q) => q.eq('environment', environment).eq('active', true)).collect();
  return { web: manifests.find((row) => row.runtime === 'web'), convex: manifests.find((row) => row.runtime === 'convex') };
}

export const activate = mutation({
  args: { secret: v.string(), configId: v.id('executiveChatRolloutConfigs'), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    const config = await ctx.db.get(args.configId);
    if (!config || config.status !== 'approved' || !config.approver) throw new Error('rollout_config_not_approved');
    if (!args.actor.trim() || args.reason.trim().length < 12) throw new Error('rollout_activation_metadata_invalid');
    const pair = await activeReleasePair(ctx, config.environment);
    if (!pair.web || !pair.convex || pair.web.gitSha !== pair.convex.gitSha) throw new Error('rollout_release_pair_incompatible');
    for (const field of ['schemaVersion', 'controlVersion', 'capabilityVersion', 'validatorVersion', 'promptPolicyVersion'] as const) {
      if (pair.web[field] !== config[field] || pair.convex[field] !== config[field]) throw new Error(`rollout_release_${field}_mismatch`);
    }
    const smoke = await ctx.db.query('executiveChatReleaseAssuranceRuns')
      .withIndex('by_git_environment', (q) => q.eq('gitSha', pair.web!.gitSha).eq('environment', config.environment))
      .order('desc').first();
    if (!smoke || smoke.status !== 'succeeded' || Date.now() - smoke.completedAt > 24 * 60 * 60 * 1000) throw new Error('rollout_current_release_smoke_missing');
    const now = Date.now();
    const active = await ctx.db.query('executiveChatRolloutConfigs').withIndex('by_environment_status', (q) => q.eq('environment', config.environment).eq('status', 'active')).collect();
    for (const prior of active) await ctx.db.patch(prior._id, { status: 'superseded', supersededAt: now, updatedAt: now });
    await ctx.db.patch(config._id, { status: 'active', activatedAt: now, updatedAt: now });
    await ctx.db.insert('executiveChatRolloutEvents', { configId: config._id, configVersion: config.version, environment: config.environment, eventType: 'activated', actor: args.actor, reason: args.reason, changeTicket: config.changeTicket, detailJson: JSON.stringify({ gitSha: pair.web.gitSha, smokeId: smoke._id }), createdAt: now });
    return { active: true, version: config.version, gitSha: pair.web.gitSha };
  },
});

export const emergencyDisable = mutation({
  args: { secret: v.string(), configId: v.id('executiveChatRolloutConfigs'), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error('rollout_config_not_found');
    const now = Date.now();
    await ctx.db.patch(config._id, { emergencyDisabled: true, updatedAt: now });
    await ctx.db.insert('executiveChatRolloutEvents', { configId: config._id, configVersion: config.version, environment: config.environment, eventType: 'emergency_disabled', actor: args.actor, reason: args.reason, changeTicket: config.changeTicket, detailJson: '{}', createdAt: now });
    return { disabled: true, version: config.version };
  },
});

export const recordReleaseAssurance = mutation({
  args: {
    secret: v.string(), environment: environmentValidator, gitSha: v.string(), webDeploymentId: v.string(),
    convexDeploymentId: v.string(), status: v.union(v.literal('succeeded'), v.literal('failed')),
    suites: v.array(v.string()), reportDigest: v.string(), workflowRunId: v.optional(v.string()), completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    if (!/^[a-f0-9]{7,64}$/i.test(args.gitSha) || args.suites.length === 0 || !args.reportDigest.trim()) throw new Error('release_assurance_invalid');
    const pair = await activeReleasePair(ctx, args.environment);
    if (
      !pair.web || !pair.convex ||
      pair.web.gitSha !== args.gitSha || pair.convex.gitSha !== args.gitSha ||
      pair.web.deploymentId !== args.webDeploymentId || pair.convex.deploymentId !== args.convexDeploymentId
    ) {
      throw new Error('release_assurance_pair_mismatch');
    }
    const { secret: _secret, ...record } = args;
    void _secret;
    return ctx.db.insert('executiveChatReleaseAssuranceRuns', { ...record, createdAt: Date.now() });
  },
});

export const effectiveForTurn = internalQuery({
  args: { environment: environmentValidator, userId: v.string(), orgId: v.optional(v.string()), caseId: v.optional(v.string()), conversationId: v.optional(v.string()), qaSynthetic: v.optional(v.boolean()) },
  handler: (ctx, args) => resolveRolloutForSubject(ctx, args, args.environment),
});

export const effectiveForAuthenticatedUser = query({
  args: { conversationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const decision = await resolveRolloutForSubject(ctx, { userId: user._id.toString(), conversationId: args.conversationId });
    return { configVersion: decision.configVersion, modes: decision.modes, selected: decision.selected, selectionReason: decision.selectionReason };
  },
});

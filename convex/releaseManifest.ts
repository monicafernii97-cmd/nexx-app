import { internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';
import {
  CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT,
  releaseContractsCompatible,
} from '../src/lib/nexx/releaseContract';

const runtimeValidator = v.union(v.literal('web'), v.literal('convex'));
const environmentValidator = v.union(v.literal('preview'), v.literal('production'));

function requireReleaseSecret(secret: string) {
  const expected = process.env.VERIFICATION_SECRET;
  if (!expected || secret !== expected) throw new Error('release_manifest_not_authorized');
}

const manifestArgs = {
  runtime: runtimeValidator,
  environment: environmentValidator,
  gitSha: v.string(),
  deploymentId: v.string(),
  schemaVersion: v.string(),
  controlVersion: v.string(),
  capabilityVersion: v.string(),
  validatorVersion: v.string(),
  promptPolicyVersion: v.string(),
  compatibleMinPeerVersion: v.string(),
  deployedAt: v.number(),
};

async function writeManifest(ctx: MutationCtx, args: {
  runtime: 'web' | 'convex'; environment: 'preview' | 'production'; gitSha: string; deploymentId: string;
  schemaVersion: string; controlVersion: string; capabilityVersion: string; validatorVersion: string;
  promptPolicyVersion: string; compatibleMinPeerVersion: string; deployedAt: number;
}) {
  if (!/^[a-f0-9]{7,64}$/i.test(args.gitSha)) throw new Error('release_manifest_invalid_git_sha');
  const existing = await ctx.db.query('releaseManifests')
    .withIndex('by_runtime_environment', (q) => q.eq('runtime', args.runtime).eq('environment', args.environment))
    .collect();
  const now = Date.now();
  for (const manifest of existing) if (manifest.active) await ctx.db.patch(manifest._id, { active: false });
  return ctx.db.insert('releaseManifests', { ...args, active: true, createdAt: now });
}

export const upsertInternal = internalMutation({
  args: manifestArgs,
  handler: (ctx, args) => writeManifest(ctx, args),
});

/** Trusted release-workflow entry point; never callable without the server secret. */
export const upsertFromRelease = mutation({
  args: { secret: v.string(), ...manifestArgs },
  handler: (ctx, args) => {
    requireReleaseSecret(args.secret);
    const manifest = {
      runtime: args.runtime, environment: args.environment, gitSha: args.gitSha,
      deploymentId: args.deploymentId, schemaVersion: args.schemaVersion,
      controlVersion: args.controlVersion, capabilityVersion: args.capabilityVersion,
      validatorVersion: args.validatorVersion, promptPolicyVersion: args.promptPolicyVersion,
      compatibleMinPeerVersion: args.compatibleMinPeerVersion, deployedAt: args.deployedAt,
    };
    return writeManifest(ctx, manifest);
  },
});

async function compatibility(ctx: Parameters<typeof getAuthenticatedUser>[0], environment: 'preview' | 'production') {
  const active = await ctx.db.query('releaseManifests')
    .withIndex('by_environment_active', (q) => q.eq('environment', environment).eq('active', true))
    .collect();
  const web = active.find((manifest) => manifest.runtime === 'web');
  const convex = active.find((manifest) => manifest.runtime === 'convex');
  const compatible = Boolean(web && convex &&
    web.gitSha === convex.gitSha &&
    releaseContractsCompatible(web, convex) &&
    web.controlVersion === convex.controlVersion &&
    web.capabilityVersion === convex.capabilityVersion &&
    web.validatorVersion === convex.validatorVersion);
  return {
    compatible,
    reasonCodes: [
      ...(!web ? ['web_manifest_missing'] : []),
      ...(!convex ? ['convex_manifest_missing'] : []),
      ...(web && convex && web.gitSha !== convex.gitSha ? ['git_sha_mismatch'] : []),
      ...(web && convex && !releaseContractsCompatible(web, convex) ? ['schema_incompatible'] : []),
      ...(web && convex && web.controlVersion !== convex.controlVersion ? ['control_version_mismatch'] : []),
      ...(web && convex && web.capabilityVersion !== convex.capabilityVersion ? ['capability_version_mismatch'] : []),
      ...(web && convex && web.validatorVersion !== convex.validatorVersion ? ['validator_version_mismatch'] : []),
    ],
    manifests: active.map((manifest) => ({
      runtime: manifest.runtime,
      environment: manifest.environment,
      gitSha: manifest.gitSha,
      deploymentId: manifest.deploymentId,
      schemaVersion: manifest.schemaVersion,
      controlVersion: manifest.controlVersion,
      capabilityVersion: manifest.capabilityVersion,
      validatorVersion: manifest.validatorVersion,
      promptPolicyVersion: manifest.promptPolicyVersion,
      compatibleMinPeerVersion: manifest.compatibleMinPeerVersion,
      deployedAt: manifest.deployedAt,
    })),
  };
}

export const compatibilityInternal = internalQuery({
  args: { environment: environmentValidator },
  handler: (ctx, args) => compatibility(ctx, args.environment),
});

export const getCompatibility = query({
  args: { environment: environmentValidator },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    return compatibility(ctx, args.environment);
  },
});

export const getCompatibilityForRelease = query({
  args: { environment: environmentValidator, secret: v.string() },
  handler: (ctx, args) => {
    requireReleaseSecret(args.secret);
    return compatibility(ctx, args.environment);
  },
});

export const currentContract = query({
  args: {},
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx);
    return CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT;
  },
});

import { internalAction, internalMutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { makeFunctionReference, type FunctionReference } from 'convex/server';
import { CHAT_UPLOAD_CONFIG } from './lib/chatUploadConfig';

type CanaryPhase = 'route' | 'generate_url' | 'post' | 'metadata' | 'read' | 'cleanup' | 'complete';
type StartCanaryResult =
  | { skipped: true; runId: Id<'chatUploadCanaryRuns'> }
  | { skipped: false; runId: Id<'chatUploadCanaryRuns'> };
const START_CANARY_RUN: FunctionReference<
  'mutation',
  'internal',
  { expectedSha256: string; byteSize: number },
  StartCanaryResult
> = makeFunctionReference<'mutation', { expectedSha256: string; byteSize: number }, StartCanaryResult>(
  'chatUploadCanary:startCanaryRun',
) as unknown as FunctionReference<'mutation', 'internal', { expectedSha256: string; byteSize: number }, StartCanaryResult>;
const ADVANCE_CANARY_RUN: FunctionReference<
  'mutation',
  'internal',
  {
    runId: Id<'chatUploadCanaryRuns'>;
    phase: CanaryPhase;
    storageId?: Id<'_storage'>;
    actualSha256?: string;
    cleanupSucceeded?: boolean;
  },
  boolean
> = makeFunctionReference('chatUploadCanary:advanceCanaryRun') as unknown as FunctionReference<
  'mutation',
  'internal',
  {
    runId: Id<'chatUploadCanaryRuns'>;
    phase: CanaryPhase;
    storageId?: Id<'_storage'>;
    actualSha256?: string;
    cleanupSucceeded?: boolean;
  },
  boolean
>;
const FINISH_CANARY_RUN: FunctionReference<
  'mutation',
  'internal',
  {
    runId: Id<'chatUploadCanaryRuns'>;
    status: 'succeeded' | 'failed';
    phase: CanaryPhase;
    storageId?: Id<'_storage'>;
    actualSha256?: string;
    cleanupSucceeded?: boolean;
    errorCode?: string;
  },
  boolean
> = makeFunctionReference('chatUploadCanary:finishCanaryRun') as unknown as FunctionReference<
  'mutation',
  'internal',
  {
    runId: Id<'chatUploadCanaryRuns'>;
    status: 'succeeded' | 'failed';
    phase: CanaryPhase;
    storageId?: Id<'_storage'>;
    actualSha256?: string;
    cleanupSucceeded?: boolean;
    errorCode?: string;
  },
  boolean
>;

const canaryPhaseValidator = v.union(
  v.literal('route'),
  v.literal('generate_url'),
  v.literal('post'),
  v.literal('metadata'),
  v.literal('read'),
  v.literal('cleanup'),
  v.literal('complete'),
);

async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canaryPayload() {
  const bytes = new Uint8Array(CHAT_UPLOAD_CONFIG.canaryPayloadBytes);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 17) % 256;
  return bytes;
}

function canarySiteUrl() {
  const configured = process.env.CONVEX_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const cloudUrl = process.env.CONVEX_CLOUD_URL?.trim();
  if (cloudUrl?.endsWith('.convex.cloud')) return cloudUrl.replace(/\.convex\.cloud\/?$/, '.convex.site');
  throw new Error('canary_site_url_missing');
}

export const startCanaryRun = internalMutation({
  args: { expectedSha256: v.string(), byteSize: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const recentRunning = await ctx.db
      .query('chatUploadCanaryRuns')
      .withIndex('by_status_created', (q) => q.eq('status', 'running'))
      .order('desc')
      .first();
    if (recentRunning && recentRunning.createdAt > now - CHAT_UPLOAD_CONFIG.canaryIntervalMs) {
      return { skipped: true as const, runId: recentRunning._id };
    }
    if (recentRunning) {
      await ctx.db.patch(recentRunning._id, {
        status: 'failed',
        errorCode: 'canary_run_stalled',
        latencyMs: now - recentRunning.startedAt,
        finishedAt: now,
        updatedAt: now,
      });
    }
    const runId = await ctx.db.insert('chatUploadCanaryRuns', {
      status: 'running',
      phase: 'route',
      byteSize: args.byteSize,
      expectedSha256: args.expectedSha256,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { skipped: false as const, runId };
  },
});

export const advanceCanaryRun = internalMutation({
  args: {
    runId: v.id('chatUploadCanaryRuns'),
    phase: canaryPhaseValidator,
    storageId: v.optional(v.id('_storage')),
    actualSha256: v.optional(v.string()),
    cleanupSucceeded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== 'running') return false;
    await ctx.db.patch(run._id, {
      phase: args.phase,
      storageId: args.storageId ?? run.storageId,
      actualSha256: args.actualSha256 ?? run.actualSha256,
      cleanupSucceeded: args.cleanupSucceeded ?? run.cleanupSucceeded,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const finishCanaryRun = internalMutation({
  args: {
    runId: v.id('chatUploadCanaryRuns'),
    status: v.union(v.literal('succeeded'), v.literal('failed')),
    phase: canaryPhaseValidator,
    storageId: v.optional(v.id('_storage')),
    actualSha256: v.optional(v.string()),
    cleanupSucceeded: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return false;
    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: args.status,
      phase: args.phase,
      storageId: args.storageId ?? run.storageId,
      actualSha256: args.actualSha256 ?? run.actualSha256,
      cleanupSucceeded: args.cleanupSucceeded ?? run.cleanupSucceeded,
      errorCode: args.errorCode?.slice(0, 120),
      latencyMs: now - run.startedAt,
      finishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

/** Exercise a real generated upload URL, metadata read, object read, and cleanup in the active deployment. */
export const runProductionUploadCanary = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    skipped: boolean;
    ok?: boolean;
    runId?: Id<'chatUploadCanaryRuns'>;
    errorCode?: string;
  }> => {
    if (process.env.CHAT_UPLOAD_CANARY_ENABLED === 'false') return { skipped: true };
    const payload = canaryPayload();
    const expectedSha256 = await sha256Hex(payload.buffer as ArrayBuffer);
    const started: StartCanaryResult = await ctx.runMutation(START_CANARY_RUN, {
      expectedSha256,
      byteSize: payload.byteLength,
    });
    if (started.skipped) return { skipped: true, runId: started.runId };
    const runId = started.runId;
    let storageId: Id<'_storage'> | undefined;
    let phase: CanaryPhase = 'route';
    let actualSha256: string | undefined;
    let cleanupSucceeded = false;
    try {
      const routeUrl = `${canarySiteUrl()}/chat-upload-resumable-chunk`;
      await ctx.runMutation(ADVANCE_CANARY_RUN, { runId, phase });
      const preflight = await fetch(routeUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://nexproof.io',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type,x-chunk-sha256',
        },
      });
      if (
        preflight.status !== 204 ||
        preflight.headers.get('access-control-allow-origin') !== 'https://nexproof.io'
      ) throw new Error(`canary_route_preflight_${preflight.status}`);
      const unauthenticated = await fetch(`${routeUrl}?uploadSessionId=canary&resumableUploadId=canary&chunkIndex=0`, {
        method: 'POST',
        headers: { Origin: 'https://nexproof.io', 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([1]),
      });
      if (unauthenticated.status !== 401) throw new Error(`canary_route_auth_${unauthenticated.status}`);

      phase = 'generate_url';
      await ctx.runMutation(ADVANCE_CANARY_RUN, { runId, phase });
      const uploadUrl = await ctx.storage.generateUploadUrl();
      phase = 'post';
      await ctx.runMutation(ADVANCE_CANARY_RUN, { runId, phase });
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Origin: 'https://nexproof.io',
          'Content-Type': 'application/octet-stream',
        },
        body: payload,
      });
      if (!response.ok) throw new Error(`canary_post_${response.status}`);
      const storageAllowedOrigin = response.headers.get('access-control-allow-origin');
      if (storageAllowedOrigin !== '*' && storageAllowedOrigin !== 'https://nexproof.io') {
        throw new Error('canary_storage_cors_missing');
      }
      const json = await response.json() as { storageId?: string };
      if (!json.storageId) throw new Error('canary_storage_id_missing');
      storageId = json.storageId as Id<'_storage'>;

      phase = 'metadata';
      await ctx.runMutation(ADVANCE_CANARY_RUN, { runId, phase, storageId });
      const metadata = await ctx.storage.getMetadata(storageId);
      if (!metadata || metadata.size !== payload.byteLength || metadata.sha256 !== expectedSha256) {
        throw new Error('canary_metadata_mismatch');
      }
      actualSha256 = metadata.sha256;

      phase = 'read';
      await ctx.runMutation(ADVANCE_CANARY_RUN, { runId, phase, storageId, actualSha256 });
      const stored = await ctx.storage.get(storageId);
      if (!stored || await sha256Hex(await stored.arrayBuffer()) !== expectedSha256) {
        throw new Error('canary_read_mismatch');
      }

      phase = 'cleanup';
      await ctx.runMutation(ADVANCE_CANARY_RUN, { runId, phase, storageId, actualSha256 });
      await ctx.storage.delete(storageId);
      cleanupSucceeded = true;
      phase = 'complete';
      await ctx.runMutation(FINISH_CANARY_RUN, {
        runId, status: 'succeeded', phase, storageId, actualSha256, cleanupSucceeded,
      });
      return { skipped: false, ok: true, runId };
    } catch (error) {
      if (storageId && !cleanupSucceeded) {
        try {
          await ctx.storage.delete(storageId);
          cleanupSucceeded = true;
        } catch {
          cleanupSucceeded = false;
        }
      }
      const errorCode = error instanceof Error ? error.message.slice(0, 120) : 'canary_unknown_failure';
      await ctx.runMutation(FINISH_CANARY_RUN, {
        runId, status: 'failed', phase, storageId, actualSha256, cleanupSucceeded, errorCode,
      });
      console.error(JSON.stringify({ level: 'error', event: 'chat_upload_canary_failed', phase, errorCode }));
      return { skipped: false, ok: false, runId, errorCode };
    }
  },
});

export const auditProductionUploadCanary = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.CHAT_UPLOAD_CANARY_ENABLED === 'false') return { disabled: true };
    const latest = await ctx.db.query('chatUploadCanaryRuns').withIndex('by_created').order('desc').first();
    const now = Date.now();
    const latestSuccess = await ctx.db
      .query('chatUploadCanaryRuns')
      .withIndex('by_status_created', (q) => q.eq('status', 'succeeded'))
      .order('desc')
      .first();
    const expiredRuns = await ctx.db
      .query('chatUploadCanaryRuns')
      .withIndex('by_created', (q) => q.lt('createdAt', now - CHAT_UPLOAD_CONFIG.canaryRetentionMs))
      .take(100);
    for (const run of expiredRuns) await ctx.db.delete(run._id);
    const stale = !latestSuccess || now - latestSuccess.createdAt > CHAT_UPLOAD_CONFIG.canaryStaleAfterMs;
    const failed = latest?.status === 'failed' && (!latestSuccess || latest.createdAt > latestSuccess.createdAt);
    const runningStalled = latest?.status === 'running' && now - latest.createdAt > CHAT_UPLOAD_CONFIG.canaryIntervalMs * 2;
    if (stale || failed || runningStalled) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'chat_upload_canary_unhealthy',
        reason: failed ? 'failed' : runningStalled ? 'running_stalled' : 'stale_or_missing_success',
        latestStatus: latest?.status ?? 'missing',
        latestPhase: latest?.phase ?? 'missing',
        ageMinutes: latest ? Math.round((now - latest.createdAt) / 60_000) : null,
        errorCode: latest?.errorCode,
      }));
    }
    return {
      healthy: !stale && !failed && !runningStalled,
      stale,
      failed,
      runningStalled,
      latestStatus: latest?.status ?? 'missing',
      expiredRunsDeleted: expiredRuns.length,
    };
  },
});

/** Safe release-verification view; contains no user or document data. */
export const getLatestCanaryStatus = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query('chatUploadCanaryRuns').withIndex('by_created').order('desc').first();
    if (!latest) return { healthy: false, status: 'missing' as const };
    const ageMs = Date.now() - latest.createdAt;
    return {
      healthy: latest.status === 'succeeded' && ageMs <= CHAT_UPLOAD_CONFIG.canaryStaleAfterMs,
      status: latest.status,
      phase: latest.phase,
      ageMs,
      latencyMs: latest.latencyMs,
      cleanupSucceeded: latest.cleanupSucceeded,
      errorCode: latest.errorCode,
      finishedAt: latest.finishedAt,
    };
  },
});

import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

/**
 * Clean up expired tool run records daily.
 * The deleteExpired mutation removes records older than the 30-day retention window.
 */
crons.daily(
  'clean up expired tool runs',
  { hourUTC: 6, minuteUTC: 0 },
  internal.toolRuns.deleteExpired,
);

crons.daily(
  'clean up expired document retrieval audits',
  { hourUTC: 6, minuteUTC: 20 },
  internal.chatTurns.deleteExpiredDocumentRetrievalAudits,
);

/**
 * Reap stale in_progress export runs and timed-out jobs every 5 minutes.
 * Any exportRun still in_progress after 10 minutes is marked failed with EXPORT_JOB_TIMEOUT.
 */
crons.interval(
  'reap stale export runs',
  { minutes: 5 },
  internal.exportRunsMaintenance.reapStaleRuns,
);

/**
 * Re-queue or finalize chat generation jobs whose worker lease expired.
 * Convex scheduled actions are at-most-once, so chat jobs need app-level
 * lease recovery to keep accepted turns from hanging forever.
 */
crons.interval(
  'recover stale chat generation jobs',
  { minutes: 5 },
  internal.chatTurns.recoverStaleJobs,
);

/**
 * Mark stale chat upload processing as retryable and purge abandoned cancelled
 * upload sessions. This keeps direct-storage uploads from wedging the composer.
 */
crons.interval(
  'clean up stale chat uploads',
  { minutes: 5 },
  internal.chatUploads.cleanupStaleUploadSessions,
);

crons.interval(
  'clean up fallback upload tickets',
  { minutes: 5 },
  internal.chatUploads.cleanupFallbackUploadTickets,
);

crons.interval(
  'clean up resumable chat uploads',
  { minutes: 5 },
  internal.chatUploads.cleanupResumableUploads,
);

crons.interval(
  'clean up direct response-loss orphans',
  { minutes: 5 },
  internal.chatUploads.cleanupDirectResponseLossOrphans,
);

crons.interval(
  'audit recent chat upload failures',
  { minutes: 5 },
  internal.chatUploads.auditRecentStorageUploadFailures,
);

crons.interval(
  'run production chat upload canary',
  { minutes: 10 },
  internal.chatUploadCanary.runProductionUploadCanary,
);

crons.interval(
  'audit production chat upload canary',
  { minutes: 5 },
  internal.chatUploadCanary.auditProductionUploadCanary,
);

crons.interval(
  'run executive chat quality canary',
  { minutes: 10 },
  internal.chatQualityCanary.runExecutiveChatCanary,
);

crons.interval(
  'audit executive chat quality canary',
  { minutes: 5 },
  internal.chatQualityCanary.auditExecutiveChatCanary,
  {},
);

crons.interval(
  'snapshot executive chat rollout health',
  { minutes: 5 },
  internal.executiveChatOperations.audit,
  {},
);

crons.daily(
  'clean up executive chat quality canary runs',
  { hourUTC: 6, minuteUTC: 40 },
  internal.chatQualityCanary.cleanupOldRuns,
);

crons.interval(
  'clean up stale chat upload drafts',
  { minutes: 5 },
  internal.conversations.cleanupStaleUploadDrafts,
);

crons.hourly(
  'clean up abandoned synthetic upload runs',
  { minuteUTC: 40 },
  internal.chatUploadE2E.cleanupAbandonedRuns,
);

/**
 * Purge expired export run and job records daily (30-day retention).
 * Only deletes terminal records (completed, failed, timeout).
 */
crons.daily(
  'purge expired export runs',
  { hourUTC: 7, minuteUTC: 0 },
  internal.exportRunsMaintenance.purgeExpiredRuns,
);

export default crons;

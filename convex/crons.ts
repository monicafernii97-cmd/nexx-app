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
  { minutes: 1 },
  internal.chatTurns.recoverStaleJobs,
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

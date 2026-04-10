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

export default crons;

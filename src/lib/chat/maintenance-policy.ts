/** Safety-sweep interval for expired generation leases. */
export const CHAT_RECOVERY_SWEEP_MINUTES = 5;
/** Worker lease duration before it becomes eligible for recovery. */
export const CHAT_JOB_LEASE_MINUTES = 2;
/** Worst-case delay after lease expiry before the safety sweep sees it. */
export const CHAT_RECOVERY_MAX_AFTER_EXPIRY_MINUTES = CHAT_RECOVERY_SWEEP_MINUTES;

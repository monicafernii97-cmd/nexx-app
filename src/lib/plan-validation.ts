import { PLANS } from './plans';

/** Pre-built set of valid plan tier strings, derived from the PLANS constant. */
const VALID_PLAN_TIERS: Set<string> = new Set(PLANS.map((p) => p.tier));

/**
 * Check whether a plan string is a valid, recognised tier.
 * Safely handles null / undefined.
 */
export function isValidPlan(plan?: string | null): plan is string {
    return !!plan && VALID_PLAN_TIERS.has(plan);
}

/**
 * Read the selected plan from sessionStorage (browser-only).
 * Returns null on the server or when no plan has been stored.
 */
export function getSessionPlan(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem('selectedPlan') : null;
}

/**
 * Resolve the best available plan for a user.
 *
 * Prefers sessionStorage (most recent user action) over the DB-persisted
 * subscriptionTier. Returns null if neither source has a valid plan.
 */
export function getValidSelectedPlan(
    currentUser: { subscriptionTier?: string } | null | undefined,
): string | null {
    const storedPlan = getSessionPlan();
    const dbPlan = currentUser?.subscriptionTier ?? null;
    if (storedPlan && VALID_PLAN_TIERS.has(storedPlan)) return storedPlan;
    if (dbPlan && VALID_PLAN_TIERS.has(dbPlan)) return dbPlan;
    return null;
}

export { VALID_PLAN_TIERS };

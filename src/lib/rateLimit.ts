/**
 * Per-User Rate Limiter — In-Memory Sliding Window
 *
 * Provides per-user, per-feature rate limiting with configurable
 * window durations and max request counts. Designed for the free tier;
 * will be replaced/augmented by subscription-tier checks later.
 *
 * NOTE: In-memory — resets on process restart and is per-instance.
 * For multi-instance deployments, move to Redis or Convex-backed limits.
 */

// ── Feature Limits ──

export type RateLimitFeature =
    | 'court_rules_lookup'
    | 'document_generation'
    | 'compliance_check'
    | 'chat_message'
    | 'legal_search';

interface FeatureLimit {
    /** Maximum requests allowed in the window */
    maxRequests: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Human-readable description for error messages */
    label: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MONTH_MS = 30 * ONE_DAY_MS;

/**
 * Free-tier rate limits per feature.
 * Adjust these when implementing subscription tiers.
 */
export const FEATURE_LIMITS: Record<RateLimitFeature, FeatureLimit> = {
    court_rules_lookup: {
        maxRequests: 3,
        windowMs: ONE_MONTH_MS,
        label: 'court rules lookups',
    },
    document_generation: {
        maxRequests: 3,
        windowMs: ONE_MONTH_MS,
        label: 'document generations',
    },
    compliance_check: {
        maxRequests: 3,
        windowMs: ONE_MONTH_MS,
        label: 'compliance checks',
    },
    chat_message: {
        maxRequests: 50,
        windowMs: ONE_DAY_MS,
        label: 'chat messages',
    },
    legal_search: {
        maxRequests: 10,
        windowMs: ONE_MONTH_MS,
        label: 'legal statute searches',
    },
};

// ── Rate Limit Store ──

interface UserFeatureWindow {
    /** Timestamps of requests within the current window */
    timestamps: number[];
}

/** Key: "userId:feature" → window state */
const store = new Map<string, UserFeatureWindow>();

/** Prevent unbounded growth — evict stale entries periodically */
const MAX_STORE_SIZE = 10_000;
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Periodically evict stale entries from the rate limit store to prevent unbounded memory growth. */
function cleanup(): void {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;

    for (const [key, window] of store.entries()) {
        const limit = getLimitForKey(key);
        if (!limit) {
            store.delete(key);
            continue;
        }
        // Prune expired timestamps
        window.timestamps = window.timestamps.filter(
            (t) => now - t < limit.windowMs
        );
        // Remove empty buckets
        if (window.timestamps.length === 0) {
            store.delete(key);
        }
    }
}

/** Extract the feature limit config from a composite store key ("userId:feature"). */
function getLimitForKey(key: string): FeatureLimit | null {
    const feature = key.split(':')[1] as RateLimitFeature;
    return FEATURE_LIMITS[feature] ?? null;
}

// ── Public API ──

export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Current usage count in this window */
    current: number;
    /** Maximum allowed in this window */
    limit: number;
    /** Milliseconds until the window resets */
    resetInMs: number;
    /** Human-readable feature label */
    featureLabel: string;
}

/**
 * Check and consume a rate limit for a user + feature.
 * Uses a true sliding window — timestamps are pruned by age,
 * not by a fixed window start anchor.
 *
 * @param userId - Clerk user ID
 * @param feature - Which feature is being rate-limited
 * @returns RateLimitResult indicating whether the request is allowed
 */
export function checkRateLimit(
    userId: string,
    feature: RateLimitFeature
): RateLimitResult {
    // Periodic cleanup to prevent memory leaks
    cleanup();

    const featureLimit = FEATURE_LIMITS[feature];
    const key = `${userId}:${feature}`;
    const now = Date.now();

    let window = store.get(key);

    // Initialize if no prior state
    if (!window) {
        window = { timestamps: [] };
        store.set(key, window);

        // Enforce max store size (FIFO eviction)
        if (store.size > MAX_STORE_SIZE) {
            const oldestKey = store.keys().next().value;
            if (oldestKey) store.delete(oldestKey);
        }
    }

    // Prune timestamps outside the sliding window
    window.timestamps = window.timestamps.filter(
        (t) => now - t < featureLimit.windowMs
    );

    // Compute resetInMs from the oldest remaining timestamp
    const resetInMs =
        window.timestamps.length === 0
            ? featureLimit.windowMs
            : Math.max(0, featureLimit.windowMs - (now - window.timestamps[0]));

    if (window.timestamps.length >= featureLimit.maxRequests) {
        return {
            allowed: false,
            current: window.timestamps.length,
            limit: featureLimit.maxRequests,
            resetInMs,
            featureLabel: featureLimit.label,
        };
    }

    // Consume the rate limit
    window.timestamps.push(now);
    return {
        allowed: true,
        current: window.timestamps.length,
        limit: featureLimit.maxRequests,
        resetInMs,
        featureLabel: featureLimit.label,
    };
}

/**
 * Build a standard 429 JSON response for rate limit rejections.
 */
export function rateLimitResponse(result: RateLimitResult) {
    const resetMinutes = Math.ceil(result.resetInMs / (60 * 1000));
    const resetHours = Math.ceil(result.resetInMs / (60 * 60 * 1000));
    const resetDisplay = resetHours > 24
        ? `${Math.ceil(resetHours / 24)} days`
        : resetHours > 1
            ? `${resetHours} hours`
            : `${resetMinutes} minutes`;

    return {
        body: {
            error: 'Rate limit exceeded',
            message: `You've used ${result.current}/${result.limit} free ${result.featureLabel} this period. Resets in ${resetDisplay}.`,
            current: result.current,
            limit: result.limit,
            resetInMs: result.resetInMs,
            upgradeHint: 'Upgrade to Premium for unlimited access.',
        },
        status: 429,
    };
}

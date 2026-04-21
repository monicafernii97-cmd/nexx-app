/**
 * Pin Autofill API Route
 *
 * POST /api/pins/autofill
 *
 * Accepts raw selected text + pin type, returns AI-cleaned
 * title + content for the PinToWorkspaceModal.
 *
 * On any AI failure, returns a fallback result with 200 —
 * the pin flow must never be blocked by this endpoint.
 *
 * Rate-limited per user to prevent excessive OpenAI API costs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generatePinAutofill } from '@/lib/pins/generatePinAutofill';
import type { PinAutofillInput } from '@/lib/pins/types';
import { VALID_PIN_TYPES } from '@/lib/pins/types';

// ═══════════════════════════════════════════════════════════════
// In-memory per-user rate limiter (token bucket)
// ═══════════════════════════════════════════════════════════════

/** Max requests per user within the sliding window. */
const RATE_LIMIT_MAX = 20;

/** Sliding window duration in milliseconds (60 seconds). */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * In-memory rate limit store.
 * Maps userId → array of request timestamps within the window.
 *
 * NOTE: This is per-process only. For multi-instance deployments,
 * swap with Redis INCR/EXPIRE or an external rate limiter.
 */
const rateLimitStore = new Map<string, number[]>();

/** Returns true if the user has exceeded the rate limit. */
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Get existing timestamps, filter to current window
  const timestamps = (rateLimitStore.get(userId) ?? []).filter(t => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(userId, timestamps);
    return true;
  }

  // Record this request
  timestamps.push(now);
  rateLimitStore.set(userId, timestamps);
  return false;
}

// ═══════════════════════════════════════════════════════════════
// POST Handler
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // ── Auth guard ──
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  // ── Rate limit check ──
  if (isRateLimited(userId)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again shortly.' },
      { status: 429 },
    );
  }

  // ── Parse body ──
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON in request body' },
      { status: 400 },
    );
  }

  // ── Validate required fields ──
  const pinType = body.pinType;
  const rawSourceText = body.rawSourceText;

  if (typeof pinType !== 'string' || !VALID_PIN_TYPES.has(pinType)) {
    return NextResponse.json(
      { error: `Invalid pinType. Must be one of: ${[...VALID_PIN_TYPES].join(', ')}` },
      { status: 400 },
    );
  }

  if (typeof rawSourceText !== 'string' || !rawSourceText.trim()) {
    return NextResponse.json(
      { error: 'rawSourceText is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  // ── Build input ──
  const input: PinAutofillInput = {
    pinType: pinType as PinAutofillInput['pinType'],
    rawSourceText: rawSourceText.trim(),
    surroundingContext: typeof body.surroundingContext === 'string'
      ? body.surroundingContext
      : null,
    sourceMessageId: typeof body.sourceMessageId === 'string'
      ? body.sourceMessageId
      : null,
    sourceSectionId: typeof body.sourceSectionId === 'string'
      ? body.sourceSectionId
      : null,
  };

  // ── Generate autofill (never throws — always returns result) ──
  const result = await generatePinAutofill(input);

  return NextResponse.json(result);
}

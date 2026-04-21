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
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generatePinAutofill } from '@/lib/pins/generatePinAutofill';
import type { PinAutofillInput } from '@/lib/pins/types';

// ═══════════════════════════════════════════════════════════════
// Valid pin types (runtime validation)
// ═══════════════════════════════════════════════════════════════

const VALID_PIN_TYPES = new Set([
  'key_fact',
  'strategy_point',
  'good_faith_point',
  'strength_highlight',
  'risk_concern',
  'hearing_prep_point',
  'draft_snippet',
  'question_to_verify',
  'timeline_anchor',
]);

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

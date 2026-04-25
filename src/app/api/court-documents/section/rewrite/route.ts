/**
 * API Route: Section Rewrite
 *
 * POST /api/court-documents/section/rewrite
 *
 * Hardening:
 * - Auth validation (Clerk)
 * - Request schema validation
 * - 60s timeout via AbortController
 * - Structured failure response
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { rewriteToCourtReady } from '@/lib/court-documents/rewriteSection';

const TIMEOUT_MS = 60_000;

export async function POST(request: Request) {
  // ── Auth ──
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // ── Schema Validation ──
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const { content, note, heading, documentType } = body;

  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json(
      { success: false, error: 'MISSING_CONTENT' },
      { status: 400 },
    );
  }
  if (typeof heading !== 'string' || !heading.trim()) {
    return NextResponse.json(
      { success: false, error: 'MISSING_HEADING' },
      { status: 400 },
    );
  }
  if (typeof documentType !== 'string' || !documentType.trim()) {
    return NextResponse.json(
      { success: false, error: 'MISSING_DOCUMENT_TYPE' },
      { status: 400 },
    );
  }

  // ── Timeout ──
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const result = await rewriteToCourtReady({
      content: content as string,
      feedbackNote: typeof note === 'string' ? note : undefined,
      heading: heading as string,
      documentType: documentType as string,
      signal: controller.signal,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'AI_REWRITE_TIMEOUT' },
        { status: 504 },
      );
    }

    console.error('[API /court-documents/section/rewrite]', err);
    return NextResponse.json(
      { success: false, error: 'AI_REWRITE_FAILED' },
      { status: 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}

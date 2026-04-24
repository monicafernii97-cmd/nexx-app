/**
 * API Route: Section Generation
 *
 * POST /api/court-documents/section/generate
 *
 * Hardening:
 * - Auth validation (Clerk)
 * - Request schema validation
 * - 60s timeout via AbortController
 * - Structured failure response
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateSectionContent } from '@/lib/court-documents/generateSection';

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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const { sectionId, heading, documentType, documentContext, courtRules } = body;

  if (typeof sectionId !== 'string' || !sectionId.trim()) {
    return NextResponse.json(
      { success: false, error: 'MISSING_SECTION_ID' },
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
    const result = await generateSectionContent({
      sectionId: sectionId as string,
      heading: heading as string,
      documentType: documentType as string,
      documentContext: typeof documentContext === 'string' ? documentContext : undefined,
      courtRules: courtRules && typeof courtRules === 'object'
        ? courtRules as Record<string, unknown>
        : undefined,
      signal: controller.signal,
    });

    if (!result.success) {
      const status =
        result.error === 'AI_GENERATION_TIMEOUT' ? 504 :
        result.error === 'AI_GENERATION_EMPTY' ? 502 :
        500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'AI_GENERATION_TIMEOUT' },
        { status: 504 },
      );
    }

    console.error('[API /court-documents/section/generate]', err);
    return NextResponse.json(
      { success: false, error: 'AI_GENERATION_FAILED' },
      { status: 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}

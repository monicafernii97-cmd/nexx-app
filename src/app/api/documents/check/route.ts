/**
 * Document Compliance Check API Route
 *
 * POST /api/documents/check
 *
 * Accepts a generated PDF (base64) and court settings,
 * runs both quick structural checks and AI-powered compliance analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMergedRules, getCountyRequirements } from '@/lib/legal/courtRules';
import { checkDocumentCompliance, quickComplianceCheck } from '@/lib/legal/complianceChecker';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const maxDuration = 30;

/** Maximum allowed payload sizes to prevent abuse. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_HTML_CHARS = 500_000;
const MAX_PDF_BASE64_CHARS = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // ── Auth guard ──
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // ── Rate limit (3/month free tier) ──
  const rl = checkRateLimit(userId, 'compliance_check');
  if (!rl.allowed) {
    const { body, status } = rateLimitResponse(rl);
    return NextResponse.json(body, { status });
  }

  // Early rejection of oversized payloads
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 }
    );
  }

  let body: {
    pdfBase64?: string;
    html?: string;
    state: string;
    county: string;
    userConsent?: boolean;
    quickOnly?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON in request body' },
      { status: 400 }
    );
  }

  try {
    // Validate inputs
    if (!body.state || !body.county) {
      return NextResponse.json(
        { error: 'state and county are required' },
        { status: 400 }
      );
    }

    if (!body.pdfBase64 && !body.html) {
      return NextResponse.json(
        { error: 'Either pdfBase64 or html is required' },
        { status: 400 }
      );
    }

    // Per-field size checks
    if (body.html && body.html.length > MAX_HTML_CHARS) {
      return NextResponse.json(
        { error: 'html payload too large' },
        { status: 413 }
      );
    }
    if (body.pdfBase64 && body.pdfBase64.length > MAX_PDF_BASE64_CHARS) {
      return NextResponse.json(
        { error: 'pdfBase64 payload too large' },
        { status: 413 }
      );
    }

    // Merge court rules for this state/county
    const rules = getMergedRules(body.state, body.county);
    const countyInfo = getCountyRequirements(body.state, body.county);

    // Quick structural check (instant, no AI)
    const quickChecks = body.html
      ? quickComplianceCheck(body.html, rules)
      : [];

    // If quickOnly, return just the structural checks
    if (body.quickOnly || !body.pdfBase64) {
      return NextResponse.json({
        quickChecks,
        aiReport: null,
        message: body.quickOnly
          ? 'Quick structural check only'
          : 'Provide pdfBase64 for full AI compliance analysis',
      });
    }

    // Full AI compliance check (requires user consent + PDF)
    // TODO(security): Replace client-declared userConsent with server-side
    // persisted consent lookup (e.g., from userCourtSettings.consentGrantedAt).
    // Currently the privacy gate in complianceChecker prevents PII transmission
    // without consent=true, but a caller can trivially set it to true.
    const aiReport = await checkDocumentCompliance(
      body.pdfBase64,
      rules,
      countyInfo,
      body.userConsent ?? false
    );

    return NextResponse.json({
      quickChecks,
      aiReport,
    });
  } catch (error) {
    console.error('[Compliance Check Error]', error);
    return NextResponse.json(
      { error: 'Compliance check failed' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMergedRules, getCountyRequirements } from '@/lib/legal/courtRules';
import { checkDocumentCompliance, quickComplianceCheck } from '@/lib/legal/complianceChecker';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';

export const maxDuration = 30;

/** Maximum allowed payload sizes to prevent abuse. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_HTML_CHARS = 500_000;
const MAX_PDF_BASE64_CHARS = 10 * 1024 * 1024;

/** Handle POST requests for document compliance checking — validates, rate-limits, and optionally runs AI analysis. */
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

  let raw: Record<string, unknown>;

  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON in request body' },
      { status: 400 }
    );
  }

  // ── Type validation ──
  const { state, county, pdfBase64, html, quickOnly } = raw;

  if (typeof state !== 'string' || typeof county !== 'string' || !state || !county) {
    return NextResponse.json(
      { error: 'state and county must be non-empty strings' },
      { status: 400 }
    );
  }
  if (pdfBase64 !== undefined && typeof pdfBase64 !== 'string') {
    return NextResponse.json(
      { error: 'pdfBase64 must be a string' },
      { status: 400 }
    );
  }
  if (html !== undefined && typeof html !== 'string') {
    return NextResponse.json(
      { error: 'html must be a string' },
      { status: 400 }
    );
  }
  if (quickOnly !== undefined && typeof quickOnly !== 'boolean') {
    return NextResponse.json(
      { error: 'quickOnly must be a boolean' },
      { status: 400 }
    );
  }
  if (!pdfBase64 && !html) {
    return NextResponse.json(
      { error: 'Either pdfBase64 or html is required' },
      { status: 400 }
    );
  }

  try {
    // Per-field size checks
    if (html && html.length > MAX_HTML_CHARS) {
      return NextResponse.json(
        { error: 'html payload too large' },
        { status: 413 }
      );
    }
    if (pdfBase64 && pdfBase64.length > MAX_PDF_BASE64_CHARS) {
      return NextResponse.json(
        { error: 'pdfBase64 payload too large' },
        { status: 413 }
      );
    }

    // Fetch user's formatting overrides (if any) for accurate rule merging
    let userOverrides: Record<string, unknown> | undefined;
    try {
      const convex = await getAuthenticatedConvexClient();
      const settings = await convex.query(api.courtSettings.get, {});
      if (settings?.formattingOverrides) {
        userOverrides = settings.formattingOverrides as Record<string, unknown>;
      }
    } catch {
      // Continue without overrides — use default rules
    }

    // Merge court rules for this state/county, including user overrides
    const rules = getMergedRules(state, county, userOverrides);
    const countyInfo = getCountyRequirements(state, county);

    // Quick structural check (instant, no AI)
    const quickChecks = html
      ? quickComplianceCheck(html, rules)
      : [];

    // If quickOnly, return just the structural checks
    if (quickOnly || !pdfBase64) {
      return NextResponse.json({
        quickChecks,
        aiReport: null,
        message: quickOnly
          ? 'Quick structural check only'
          : 'Provide pdfBase64 for full AI compliance analysis',
      });
    }

    // ── Server-side consent check ──
    // Do NOT trust client-sent consent. Check the persisted consent
    // timestamp from the user's court settings in Convex.
    const convex = await getAuthenticatedConvexClient();
    const hasConsent = await convex.query(
      api.courtSettings.hasComplianceConsent,
      {}
    );

    if (!hasConsent) {
      return NextResponse.json(
        {
          error: 'Compliance consent required',
          message: 'You must grant consent for AI compliance checking before running a full analysis. This can be done in Court Settings.',
          quickChecks, // Still return the free structural checks
        },
        { status: 403 }
      );
    }

    // Full AI compliance check (server-verified consent)
    const aiReport = await checkDocumentCompliance(
      pdfBase64,
      rules,
      countyInfo,
      true // consent verified server-side above
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

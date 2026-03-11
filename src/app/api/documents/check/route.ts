import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMergedRules, getCountyRequirements } from '@/lib/legal/courtRules';
import { checkDocumentCompliance, quickComplianceCheck } from '@/lib/legal/complianceChecker';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { getConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';

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

    // ── Server-side consent check ──
    // Do NOT trust client-sent consent. Check the persisted consent
    // timestamp from the user's court settings in Convex.
    const convex = getConvexClient();
    // Pass the Clerk session token so hasComplianceConsent can use ctx.auth
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    if (token) convex.setAuth(token);
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
      body.pdfBase64,
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


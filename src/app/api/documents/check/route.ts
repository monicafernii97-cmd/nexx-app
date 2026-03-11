/**
 * Document Compliance Check API Route
 *
 * POST /api/documents/check
 *
 * Accepts a generated PDF (base64) and court settings,
 * runs both quick structural checks and AI-powered compliance analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMergedRules, getCountyRequirements } from '@/lib/legal/courtRules';
import { checkDocumentCompliance, quickComplianceCheck } from '@/lib/legal/complianceChecker';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
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

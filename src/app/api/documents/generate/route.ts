/**
 * Document Generation API Route
 *
 * POST /api/documents/generate
 *
 * Accepts a document generation request, merges court rules,
 * renders HTML from template, converts to PDF, and returns the result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMergedRules, getCountyRequirements } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import { renderDocumentHTML } from '@/lib/legal/templateRenderer';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import type { DocumentGenerationRequest, CaptionData } from '@/lib/legal/types';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { titleCase } from '@/lib/utils/stringHelpers';

export const maxDuration = 60; // Vercel Pro plan: up to 60s for PDF generation

/** Handle POST requests to generate legal documents as PDF or HTML preview. */
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
  const rl = checkRateLimit(userId, 'document_generation');
  if (!rl.allowed) {
    const { body, status } = rateLimitResponse(rl);
    return NextResponse.json(body, { status });
  }

  // ── 0. Parse JSON body ──
  let body: DocumentGenerationRequest;
  try {
    body = (await request.json()) as DocumentGenerationRequest;
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON in request body' },
      { status: 400 }
    );
  }

  try {
    // ── 1. Validate request shape ──
    if (!body.templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    if (!body.courtSettings?.state || !body.courtSettings?.county) {
      return NextResponse.json(
        { error: 'courtSettings with state and county is required' },
        { status: 400 }
      );
    }

    if (!body.petitioner?.name) {
      return NextResponse.json(
        { error: 'petitioner with name is required' },
        { status: 400 }
      );
    }

    if (!body.caseType) {
      return NextResponse.json(
        { error: 'caseType is required' },
        { status: 400 }
      );
    }

    const template = getTemplate(body.templateId);
    if (!template) {
      return NextResponse.json(
        { error: `Template "${body.templateId}" not found` },
        { status: 404 }
      );
    }

    // ── 2. Normalize and merge court formatting rules ──
    // Title-case state/county so lookups match STATE_RULES['Texas'] and
    // COUNTY_OVERRIDES['Texas:Fort Bend'] regardless of input casing.
    const normalizedState = titleCase(body.courtSettings.state);
    const normalizedCounty = titleCase(body.courtSettings.county);

    // Priority: NEXX defaults → State → County → User overrides
    const rules = getMergedRules(
      normalizedState,
      normalizedCounty,
      body.formattingOverrides ?? {}
    );

    // ── 2b. Warn about missing required companion forms ──
    const countyReqs = getCountyRequirements(normalizedState, normalizedCounty);
    const missingForms: string[] = [];

    if (rules.requiresCivilCaseInfoSheet) {
      missingForms.push('Civil Case Information Sheet');
    }
    if (countyReqs?.requiredForms) {
      for (const f of countyReqs.requiredForms) {
        missingForms.push(f);
      }
    }

    // ── 3. Build caption data ──
    // Use normalized values for consistent caption output
    const captionBody = {
      ...body,
      courtSettings: { ...body.courtSettings, state: normalizedState, county: normalizedCounty },
    };
    const caption: CaptionData = body.caption ?? buildDefaultCaption(captionBody);

    // ── 4. Determine document title ──
    const titleText = template.sections.find(s => s.type === 'title')?.title ?? template.title;

    // ── 4b. AI drafting — generate content when bodyContent is empty ──
    let bodyContent = body.bodyContent ?? [];
    if (bodyContent.length === 0) {
      try {
        const { generateDraftContent } = await import('@/lib/nexx/documentDrafter');
        const sectionIds = template.sections
          .filter(s => s.type !== 'title' && s.type !== 'signature_block' && s.type !== 'caption')
          .map(s => s.id || s.type);

        const drafted = await generateDraftContent({
          templateId: body.templateId,
          templateName: template.title,
          sections: sectionIds,
          courtRules: rules as unknown as Record<string, unknown>,
        });

        // Transform drafter output to GeneratedSection format
        bodyContent = drafted.map(d => ({
          sectionId: d.sectionId,
          sectionType: 'body_sections' as const,
          heading: d.heading,
          content: d.body,
          numberedItems: d.numberedItems,
        }));
        console.log(`[DocuVault] AI drafted ${bodyContent.length} sections for template "${body.templateId}"`);
      } catch (draftError) {
        console.error('[DocuVault] AI drafting failed, proceeding with empty content:', draftError);
      }
    }

    // ── 5. Render HTML ──
    const html = renderDocumentHTML({
      template,
      caption,
      titleText: titleText.toUpperCase(),
      bodyContent,
      petitioner: body.petitioner,
      respondentName: body.respondent?.name,
      exhibits: body.exhibits,
      rules,
      footerText: buildFooterText(body, titleText),
    });

    // ── 6. Check if user just wants HTML preview ──
    const format = request.nextUrl.searchParams.get('format');
    if (format === 'html') {
      return NextResponse.json({
        html,
        ...(missingForms.length > 0 ? { missingRequiredForms: missingForms } : {}),
      });
    }

    // ── 7. Render PDF ──
    const pdfBytes = await renderHTMLToPDF(html, rules, caption.causeNumber);

    // ── 8. Return PDF ──
    // Include missing forms warning in a custom header so clients can detect it
    const filename = `${template.id}_${Date.now()}.pdf`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBytes.length.toString(),
    };
    if (missingForms.length > 0) {
      headers['X-Missing-Required-Forms'] = missingForms.join(', ');
    }

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[Document Generation Error]', error);
    return NextResponse.json(
      { error: 'Document generation failed' },
      { status: 500 }
    );
  }
}


// ── Helper: Build default caption from request data ──

/**
 * Build a default caption from the request data.
 * Automatically detects SAPCR cases and uses "IN THE INTEREST OF" caption style.
 */
function buildDefaultCaption(body: DocumentGenerationRequest): CaptionData {
  const { courtSettings, petitioner, respondent, children, caseType } = body;

  // Texas-style SAPCR caption: "IN THE INTEREST OF [CHILD], A CHILD"
  const isSAPCR = [
    'divorce_with_children',
    'custody_establishment',
    'custody_modification',
    'sapcr',
    'child_support',
    'child_support_modification',
    'visitation',
    'relocation',
  ].includes(caseType);

  let leftLines: string[];
  if (isSAPCR && children && children.length > 0) {
    leftLines = [
      'IN THE INTEREST OF',
      '',
      ...children.map(c => `${c.name.toUpperCase()},`),
      '',
      children.length === 1 ? 'A CHILD' : 'CHILDREN',
    ];
  } else {
    // Standard versus-style caption
    // Use party designation ('Petitioner'), NOT the signing role
    // (e.g., 'Attorney for Petitioner') — SignatureBlockData.role models
    // the signer's capacity, not the caption party designation.
    leftLines = [
      `${petitioner.name.toUpperCase()},`,
      'Petitioner',
      '',
      'v.',
      '',
      `${respondent?.name?.toUpperCase() ?? 'RESPONDENT'},`,
      'Respondent',
    ];
  }

  // Right column — court info
  const rightLines = [
    `IN THE ${courtSettings.courtName?.toUpperCase() ?? 'DISTRICT COURT'}`,
    courtSettings.judicialDistrict?.toUpperCase() ?? '',
    `${courtSettings.county.toUpperCase()} COUNTY, ${courtSettings.state.toUpperCase()}`,
  ].filter(Boolean);

  return {
    causeNumber: body.caption?.causeNumber ?? '_______________',
    leftLines,
    rightLines,
    style: courtSettings.state === 'Texas' ? 'section-symbol' : 'versus',
  };
}


// ── Helper: Build footer text ──

/** Build the page footer text containing the cause number and document title. */
function buildFooterText(body: DocumentGenerationRequest, docTitle: string): string {
  const causeNo = body.caption?.causeNumber ?? '';
  return `Cause No. ${causeNo}        ${docTitle}`;
}

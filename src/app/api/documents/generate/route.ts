/**
 * Document Generation API Route
 *
 * POST /api/documents/generate
 *
 * Accepts a document generation request, merges court rules,
 * renders HTML from template, converts to PDF, and returns the result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMergedRules } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import { renderDocumentHTML } from '@/lib/legal/templateRenderer';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import type { DocumentGenerationRequest, CaptionData, GeneratedSection } from '@/lib/legal/types';

export const maxDuration = 60; // Vercel Pro plan: up to 60s for PDF generation

/** Handle POST requests to generate legal documents as PDF or HTML preview. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DocumentGenerationRequest;

    // ── 1. Validate request ──
    if (!body.templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
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

    // ── 2. Merge court formatting rules ──
    // Priority: NEXX defaults → State → County → User overrides
    const rules = getMergedRules(
      body.courtSettings.state,
      body.courtSettings.county,
      body.formattingOverrides ?? {}
    );

    // ── 3. Build caption data ──
    const caption: CaptionData = body.caption ?? buildDefaultCaption(body);

    // ── 4. Determine document title ──
    const titleText = template.sections.find(s => s.type === 'title')?.title ?? template.title;

    // ── 5. Render HTML ──
    const html = renderDocumentHTML({
      template,
      caption,
      titleText: titleText.toUpperCase(),
      bodyContent: body.bodyContent ?? [],
      petitioner: body.petitioner,
      respondentName: body.respondent?.name,
      exhibits: body.exhibits,
      rules,
      footerText: buildFooterText(body, titleText),
    });

    // ── 6. Check if user just wants HTML preview ──
    const format = request.nextUrl.searchParams.get('format');
    if (format === 'html') {
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // ── 7. Render PDF ──
    const pdfBytes = await renderHTMLToPDF(html, rules);

    // ── 8. Return PDF ──
    const filename = `${template.id}_${Date.now()}.pdf`;
    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Document Generation Error]', error);
    return NextResponse.json(
      {
        error: 'Document generation failed',
        details: error instanceof Error ? error.message : String(error),
      },
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
    // Standard versus-style
    leftLines = [
      `${petitioner.name.toUpperCase()},`,
      petitioner.role,
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

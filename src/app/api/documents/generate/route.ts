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
import { api } from '@convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { getMergedRules, getCountyRequirements } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import type { DocumentGenerationRequest } from '@/lib/legal/types';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { titleCase } from '@/lib/utils/stringHelpers';
import { parseLegalDocument } from '@/lib/legal-docs/parseLegalDocument';
import { renderLegalDocumentHTML } from '@/lib/legal-docs/renderLegalDocumentHTML';
import { generateLegalFilename } from '@/lib/legal-docs/generateLegalFilename';
import { preflightLegalDocument } from '@/lib/legal-docs/preflightLegalDocument';
import {
  resolveJurisdictionProfile,
  toCourtFormattingRules,
  getEffectiveCourtSettings,
} from '@/lib/legal-docs/jurisdiction/resolveJurisdictionProfile';

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

    // ── 2. Resolve effective court settings (canonical source) ──
    // Precedence: Convex saved settings → payload → default
    let effectiveSettings;
    try {
      const convex = await getAuthenticatedConvexClient();
      effectiveSettings = await getEffectiveCourtSettings({
        convexQuery: () => convex.query(api.courtSettings.get, {}),
        payloadCourtSettings: body.courtSettings,
      });
    } catch (err) {
      console.warn('[DocuVault] Convex client unavailable, falling back to payload settings', err);
      effectiveSettings = await getEffectiveCourtSettings({
        convexQuery: async () => null,
        payloadCourtSettings: body.courtSettings,
      });
    }

    // Use effective settings for all downstream lookups
    const normalizedState = titleCase(effectiveSettings?.state ?? body.courtSettings.state);
    const normalizedCounty = titleCase(effectiveSettings?.county ?? body.courtSettings.county);

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

    // ── 3. Determine document title ──
    const titleText = template.sections.find(s => s.type === 'title')?.title ?? template.title;

    // ── 4b. AI drafting — generate content when bodyContent is empty ──
    let bodyContent = body.bodyContent ?? [];
    if (bodyContent.length === 0) {
      // Only draft section types that actually read from bodyContent.
      // court_address and certificate_of_service are rendered structurally
      // by templateRenderer — sending them to the drafter causes false 422s.
      const DRAFTABLE_TYPES = new Set([
        'introduction',
        'body_sections',
        'body_numbered',
        'prayer_for_relief',
      ]);

      const draftableSections = template.sections.filter(s => DRAFTABLE_TYPES.has(s.type));
      const sectionIds = draftableSections.map(s => s.id || s.type);

      // Guard against duplicate keys before Set/Map collapse them
      const duplicateRequestedIds = sectionIds.filter((id, index, ids) => ids.indexOf(id) !== index);
      if (duplicateRequestedIds.length > 0) {
        console.error('[DocuVault] Template has non-unique draft section keys:', {
          templateId: body.templateId,
          duplicates: [...new Set(duplicateRequestedIds)],
        });
        return NextResponse.json(
          { error: 'Template configuration has ambiguous draft section IDs. Please contact support.' },
          { status: 422 }
        );
      }

      // If the template has no body-backed sections, continue with empty bodyContent.
      // Structural sections (caption, title, signature, court_address, etc.) still render.
      if (sectionIds.length > 0) {
        const { generateDraftContent } = await import('@/lib/nexx/documentDrafter');

        // Build a lookup map from template so we can derive sectionType per section
        // Use || (not ??) to match sectionIds — treats '' the same as undefined
        const sectionTypeByKey = new Map(
          template.sections.map(section => [section.id || section.type, section.type] as const)
        );

        // Build minimal case context from the request body for the AI drafter
        const caseContext: Record<string, unknown> = {
          caseType: body.caseType,
          petitioner: body.petitioner?.name,
          respondent: body.respondent?.name,
          children: body.children?.map((c: { name: string; age?: number }) => ({
            name: c.name,
            age: c.age,
          })),
          court: body.courtSettings?.courtName,
          county: body.courtSettings?.county,
          state: body.courtSettings?.state,
        };

        let drafted;
        try {
          drafted = await generateDraftContent({
            templateId: body.templateId,
            templateName: template.title,
            sections: sectionIds,
            courtRules: rules as unknown as Record<string, unknown>,
            caseGraph: caseContext,
          });
        } catch (draftError) {
          // Sanitize: only log templateId + message, not raw error with case/party data
          const message = draftError instanceof Error ? draftError.message : 'Unknown AI drafting error';
          console.error('[DocuVault] AI drafting failed:', { templateId: body.templateId, message });
          return NextResponse.json(
            { error: 'AI drafting failed. Please provide bodyContent or try again.' },
            { status: 422 }
          );
        }

        if (!drafted || drafted.length === 0) {
          return NextResponse.json(
            { error: 'AI drafting produced no sections. Please provide bodyContent or try again.' },
            { status: 422 }
          );
        }

        // Reject drafts containing unresolved placeholder markers
        const PLACEHOLDER_RE = /\[FACT NEEDED:[^\[\]]+\]/i;
        const hasPlaceholders = drafted.some(section =>
          PLACEHOLDER_RE.test(section.heading) ||
          PLACEHOLDER_RE.test(section.body) ||
          (section.numberedItems?.some(item => PLACEHOLDER_RE.test(item)) ?? false)
        );
        if (hasPlaceholders) {
          return NextResponse.json(
            { error: 'AI drafting needs more case facts before a court-ready document can be generated.' },
            { status: 422 }
          );
        }

        // Validate drafted section IDs against what was requested
        const requestedIds = new Set(sectionIds);
        const unknownIds = drafted.filter(d => !requestedIds.has(d.sectionId));
        if (unknownIds.length > 0) {
          console.error('[DocuVault] AI drafter returned unexpected section IDs:', unknownIds.map(d => d.sectionId));
          return NextResponse.json(
            { error: 'AI drafting returned invalid sections. Please try again.' },
            { status: 422 }
          );
        }

        // Reject duplicate sectionIds — schema doesn't enforce uniqueness
        const duplicateIds = drafted
          .map(d => d.sectionId)
          .filter((id, index, ids) => ids.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
          console.error('[DocuVault] AI drafter returned duplicate section IDs:', duplicateIds);
          return NextResponse.json(
            { error: 'AI drafting returned duplicate sections. Please try again.' },
            { status: 422 }
          );
        }

        // Validate all requested sections were drafted
        const draftedIds = new Set(drafted.map(d => d.sectionId));
        const missingIds = sectionIds.filter(id => !draftedIds.has(id));
        if (missingIds.length > 0) {
          console.error('[DocuVault] AI drafter omitted sections:', missingIds);
          return NextResponse.json(
            { error: 'AI drafting returned incomplete sections. Please try again.' },
            { status: 422 }
          );
        }

        // Transform drafter output to GeneratedSection format, deriving sectionType from template
        bodyContent = drafted.map(d => ({
          sectionId: d.sectionId,
          sectionType: sectionTypeByKey.get(d.sectionId) ?? 'body_sections',
          heading: d.heading,
          content: d.body,
          numberedItems: d.numberedItems,
        }));
        console.log(`[DocuVault] AI drafted ${bodyContent.length} sections for template "${body.templateId}"`);
      }
    }

    // ── 5. Parse + Render via Jurisdiction-Aware Pipeline ──

    // Flatten bodyContent into raw text for the legal document parser
    const rawText = Array.isArray(bodyContent)
      ? (bodyContent as Array<{ heading?: string; paragraphs?: string[]; content?: string; numberedItems?: string[] }>)
          .flatMap(item => {
            const parts: string[] = [];
            if (item.heading) parts.push(item.heading);
            if (item.paragraphs) parts.push(...item.paragraphs);
            if (item.content) parts.push(item.content);
            if (item.numberedItems) {
              parts.push(...item.numberedItems.map((ni, idx) => `${idx + 1}. ${ni}`));
            }
            return parts;
          })
          .join('\n')
      : String(bodyContent ?? '');

    const parsed = parseLegalDocument(rawText);
    const preflight = preflightLegalDocument(parsed);

    console.log(`[DocuVault] parsed: ${parsed.sections.length} sections, title="${parsed.title.main}"`);
    if (!preflight.ok) {
      console.warn('[DocuVault] preflight warnings:', preflight.warnings);
    }

    // Apply title fallback so render + filename use the resolved title
    if (parsed.title.main === 'UNTITLED DOCUMENT') {
      parsed.title = { ...parsed.title, main: titleText };
    }

    // ── 6. Resolve Jurisdiction Profile ──
    const jurisdictionProfile = resolveJurisdictionProfile(effectiveSettings);
    const formattingRules = toCourtFormattingRules(jurisdictionProfile);

    console.log(`[DocuVault] jurisdiction=${jurisdictionProfile.key}, profile="${jurisdictionProfile.name}"`);

    // ── 7. Render Legal HTML ──
    const html = renderLegalDocumentHTML(parsed, jurisdictionProfile);



    // ── 8. Check if user just wants HTML preview ──
    const format = request.nextUrl.searchParams.get('format');
    if (format === 'html') {
      return NextResponse.json({
        html,
        ...(missingForms.length > 0 ? { missingRequiredForms: missingForms } : {}),
      });
    }

    // ── 9. Render PDF ──
    const pdfBytes = await renderHTMLToPDF(html, formattingRules, parsed.metadata.causeNumber);

    // ── 10. Return PDF ──
    const filename = generateLegalFilename(parsed);
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

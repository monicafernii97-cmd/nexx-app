/**
 * Document Generation API Route
 *
 * POST /api/documents/generate
 *
 * Accepts a document generation request, drafts content via AI
 * if needed, and delegates PDF generation to the canonical
 * `generateLegalPDF()` orchestrator.
 *
 * Route responsibilities:
 *   - Auth / rate limiting
 *   - Request parsing
 *   - Template lookup
 *   - AI drafting (when bodyContent is empty)
 *   - Delegating to orchestrator
 *   - HTTP response formatting
 *
 * Route does NOT:
 *   - Parse legal documents
 *   - Resolve jurisdiction profiles
 *   - Render HTML or PDF
 *   - Validate PDF buffers
 *
 * All of that is owned by `generateLegalPDF()`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
// courtRules is used for AI drafting context and companion form warnings,
// NOT for rendering — rendering is fully delegated to the orchestrator.
// eslint-disable-next-line no-restricted-imports
import { getCountyRequirements, getMergedRules } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import type { DocumentGenerationRequest } from '@/lib/legal/types';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { titleCase } from '@/lib/utils/stringHelpers';
import { generateLegalPDF } from '@/lib/legal-docs/generateLegalPDF';
import { LegalDocumentGenerationError } from '@/lib/legal-docs/errors';
import { getEffectiveCourtSettings } from '@/lib/legal-docs/jurisdiction/resolveJurisdictionProfile';

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

    // ── 2. Resolve effective court settings (for drafting context) ──
    let effectiveSettings;
    let convex: Awaited<ReturnType<typeof getAuthenticatedConvexClient>> | null = null;
    try {
      convex = await getAuthenticatedConvexClient();
      const client = convex;
      effectiveSettings = await getEffectiveCourtSettings({
        convexQuery: () => client.query(api.courtSettings.get, {}),
        payloadCourtSettings: body.courtSettings,
      });
    } catch (err) {
      console.warn('[DocuVault] Convex client unavailable, falling back to payload settings', err);
      effectiveSettings = await getEffectiveCourtSettings({
        convexQuery: async () => null,
        payloadCourtSettings: body.courtSettings,
      });
    }

    // Validate resolved settings so Convex/default fallback works
    const normalizedState = titleCase(effectiveSettings?.state ?? body.courtSettings?.state ?? '');
    const normalizedCounty = titleCase(effectiveSettings?.county ?? body.courtSettings?.county ?? '');

    if (!normalizedState || !normalizedCounty) {
      return NextResponse.json(
        { error: 'Court settings with state and county are required (via payload or saved settings)' },
        { status: 400 }
      );
    }

    // ── 2b. Warn about missing required companion forms ──
    const rules = getMergedRules(normalizedState, normalizedCounty, body.formattingOverrides ?? {});
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

    // ── 4. AI drafting — generate content when bodyContent is empty ──
    let bodyContent = body.bodyContent ?? [];
    if (bodyContent.length === 0) {
      const DRAFTABLE_TYPES = new Set([
        'introduction',
        'body_sections',
        'body_numbered',
        'prayer_for_relief',
      ]);

      const draftableSections = template.sections.filter(s => DRAFTABLE_TYPES.has(s.type));
      const sectionIds = draftableSections.map(s => s.id || s.type);

      // Guard against duplicate keys
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

      if (sectionIds.length > 0) {
        const { generateDraftContent } = await import('@/lib/nexx/documentDrafter');

        const sectionTypeByKey = new Map(
          template.sections.map(section => [section.id || section.type, section.type] as const)
        );

        const caseContext: Record<string, unknown> = {
          caseType: body.caseType,
          petitioner: body.petitioner?.name,
          respondent: body.respondent?.name,
          children: body.children?.map((c: { name: string; age?: number }) => ({
            name: c.name,
            age: c.age,
          })),
          court: effectiveSettings?.courtName ?? body.courtSettings?.courtName,
          county: effectiveSettings?.county ?? body.courtSettings?.county,
          state: effectiveSettings?.state ?? body.courtSettings?.state,
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

        // Validate drafted section IDs
        const requestedIds = new Set(sectionIds);
        const unknownIds = drafted.filter(d => !requestedIds.has(d.sectionId));
        if (unknownIds.length > 0) {
          console.error('[DocuVault] AI drafter returned unexpected section IDs:', unknownIds.map(d => d.sectionId));
          return NextResponse.json(
            { error: 'AI drafting returned invalid sections. Please try again.' },
            { status: 422 }
          );
        }

        // Reject duplicate sectionIds
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

        // Transform drafter output to GeneratedSection format
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

    // ── 5. Flatten bodyContent into raw text ──
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

    // ── 6. Delegate to canonical orchestrator ──
    const convexQueryFn = convex
      ? () => convex.query(api.courtSettings.get, {})
      : async () => null;

    const result = await generateLegalPDF({
      rawText,
      convexQuery: convexQueryFn,
      payloadFallback: body.courtSettings,
      fallbackTitle: titleText,
    });

    console.log(
      `[DocuVault] Generated via orchestrator: type=${result.documentType}, ` +
      `profile=${result.profileResolutionMeta.profileKey} (${result.profileResolutionMeta.source}), ` +
      `pdf=${result.pdfMeta.byteLength}b, file="${result.filename}"`
    );

    // ── 7. Check if user just wants HTML preview ──
    const format = request.nextUrl.searchParams.get('format');
    if (format === 'html') {
      return NextResponse.json({
        html: result.html,
        ...(missingForms.length > 0 ? { missingRequiredForms: missingForms } : {}),
      });
    }

    // ── 8. Return PDF ──
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.pdfMeta.byteLength.toString(),
    };
    if (missingForms.length > 0) {
      headers['X-Missing-Required-Forms'] = missingForms.join(', ');
    }

    return new NextResponse(new Uint8Array(result.pdfBuffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    // Map typed orchestrator errors to appropriate HTTP responses
    if (error instanceof LegalDocumentGenerationError) {
      console.error(`[DocuVault] Pipeline error [${error.code}]:`, error.message);

      const statusMap: Record<string, number> = {
        LEGAL_DOCUMENT_VALIDATION_FAILED: 422,
        LEGAL_DOCUMENT_RENDER_TOO_SHORT: 500,
        LEGAL_DOCUMENT_RENDER_STRUCTURE_INVALID: 500,
        LEGAL_DOCUMENT_PDF_RENDER_FAILED: 500,
        LEGAL_DOCUMENT_PDF_INVALID: 500,
      };

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusMap[error.code] ?? 500 }
      );
    }

    console.error('[Document Generation Error]', error);
    return NextResponse.json(
      { error: 'Document generation failed' },
      { status: 500 }
    );
  }
}

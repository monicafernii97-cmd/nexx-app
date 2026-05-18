import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { getMergedRules } from '@/lib/legal/courtRules';
import { escapeHtml } from '@/lib/utils/htmlUtils';
import type { CaseNarrative } from '@/lib/workspace-types';

export const maxDuration = 60;

const MAX_TITLE_CHARS = 200;
const MAX_TEXT_FIELD_CHARS = 40_000;
const MAX_LIST_ITEMS = 200;
const MAX_LIST_ITEM_CHARS = 2_000;
const MAX_REQUEST_BYTES = 1_000_000;

/** Return true only when every value in the candidate array is a string. */
function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** Validate the incoming narrative payload before rendering a PDF. */
function isCaseNarrative(value: unknown): value is CaseNarrative {
    const candidate = value as Partial<CaseNarrative> | null;
    return !!candidate
        && typeof candidate === 'object'
        && typeof candidate.title === 'string'
        && typeof candidate.overview === 'string'
        && typeof candidate.narrative === 'string'
        && isStringArray(candidate.keyFactsSummary)
        && isStringArray(candidate.timelineSummary)
        && isStringArray(candidate.supportedPatternsSummary)
        && isStringArray(candidate.openQuestions);
}

/** Return true when the declared request body is too large to parse safely. */
function isRequestBodyTooLarge(contentLength: string | null): boolean {
    if (!contentLength) return false;
    const declaredBytes = Number.parseInt(contentLength, 10);
    return Number.isFinite(declaredBytes) && declaredBytes > MAX_REQUEST_BYTES;
}

/** Return true when a narrative exceeds the safe PDF rendering limits. */
function isNarrativeTooLarge(narrative: CaseNarrative): boolean {
    const textFields = [narrative.overview, narrative.narrative];
    const listFields = [
        narrative.keyFactsSummary,
        narrative.timelineSummary,
        narrative.supportedPatternsSummary,
        narrative.openQuestions,
    ];

    return narrative.title.length > MAX_TITLE_CHARS
        || textFields.some(field => field.length > MAX_TEXT_FIELD_CHARS)
        || listFields.some(items =>
            items.length > MAX_LIST_ITEMS
            || items.some(item => item.length > MAX_LIST_ITEM_CHARS)
        );
}

/** Render a titled ordered list section for non-empty narrative arrays. */
function renderList(title: string, items: string[]): string {
    if (items.length === 0) return '';
    return `
        <h2>${escapeHtml(title)}</h2>
        <ol>
            ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ol>
    `;
}

/** Convert paragraph-delimited plain text into escaped HTML paragraphs. */
function renderParagraphs(text: string): string {
    return text
        .replace(/\r\n|\r/g, '\n')
        .split(/\n{2,}/)
        .map(paragraph => paragraph.trim())
        .filter(Boolean)
        .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');
}

/** Convert a narrative title into a conservative download filename. */
function sanitizeFilename(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80) || 'case-summary-narrative';
}

/** Render the full printable HTML document used by the narrative PDF route. */
function renderNarrativeHtml(narrative: CaseNarrative): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(narrative.title)}</title>
  <style>
    body {
      font-family: "Times New Roman", Times, serif;
      color: #111827;
      font-size: 12pt;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 18pt;
      text-align: center;
      font-size: 14pt;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h2 {
      margin: 18pt 0 8pt;
      font-size: 12pt;
      text-transform: uppercase;
    }
    p {
      margin: 0 0 12pt;
      text-align: justify;
    }
    ol {
      margin: 0 0 12pt 20pt;
      padding: 0;
    }
    li {
      margin-bottom: 6pt;
    }
    .subtitle {
      margin-bottom: 18pt;
      text-align: center;
      font-size: 10pt;
      color: #4b5563;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(narrative.title)}</h1>
  <div class="subtitle">Case Summary Narrative</div>
  <h2>Overview</h2>
  ${renderParagraphs(narrative.overview)}
  ${renderList('Key Facts', narrative.keyFactsSummary)}
  ${renderList('Timeline Summary', narrative.timelineSummary)}
  ${renderList('Supported Patterns', narrative.supportedPatternsSummary)}
  <h2>Narrative</h2>
  ${renderParagraphs(narrative.narrative)}
  ${renderList('Open Questions', narrative.openQuestions)}
</body>
</html>`;
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isRequestBodyTooLarge(req.headers.get('content-length'))) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let narrative: CaseNarrative;
    try {
        const body = await req.json();
        if (!isCaseNarrative(body.narrative)) {
            return NextResponse.json({ error: 'narrative is required' }, { status: 400 });
        }
        narrative = body.narrative;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Bound inputs before renderNarrativeHtml/renderHTMLToPDF can spend the route budget.
    if (isNarrativeTooLarge(narrative)) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    try {
        const rules = getMergedRules(undefined, undefined, {
            pageNumbering: true,
            marginTop: 1,
            marginRight: 1,
            marginBottom: 1,
            marginLeft: 1,
            fontFamily: 'Times New Roman',
            fontSize: 12,
            lineSpacing: 1.5,
        });
        const pdfBytes = await renderHTMLToPDF(renderNarrativeHtml(narrative), rules);
        const filename = `${sanitizeFilename(narrative.title)}.pdf`;

        return new NextResponse(new Uint8Array(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': pdfBytes.length.toString(),
                'Cache-Control': 'private, no-store, max-age=0',
            },
        });
    } catch (error) {
        console.error('[workspace narrative pdf] Error:', error);
        return NextResponse.json({ error: 'Failed to generate narrative PDF' }, { status: 500 });
    }
}

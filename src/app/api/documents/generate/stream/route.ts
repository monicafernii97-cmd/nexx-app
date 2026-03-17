/**
 * Document Generation Streaming API Route
 *
 * POST /api/documents/generate/stream
 *
 * Streams real-time progress updates during document generation.
 * Uses Vercel AI SDK for server-sent events streaming.
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMergedRules } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import { renderDocumentHTML } from '@/lib/legal/templateRenderer';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { quickComplianceCheck } from '@/lib/legal/complianceChecker';
import type { DocumentGenerationRequest, CaptionData } from '@/lib/legal/types';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { titleCase } from '@/lib/utils/stringHelpers';

export const maxDuration = 60;

/** Progress event sent to client */
interface ProgressEvent {
  step: string;
  message: string;
  progress: number;
  status: 'active' | 'complete' | 'error';
  /** Result data on final event */
  result?: {
    html?: string;
    pdfBase64?: string;
    compliance?: ReturnType<typeof quickComplianceCheck>;
    filename?: string;
  };
}

/** Encode a progress event as a server-sent event (SSE) data line. */
function encodeEvent(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Handle POST requests to stream document generation progress via SSE. */
export async function POST(request: NextRequest) {
  // ── Auth guard ──
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ──
  let body: DocumentGenerationRequest;
  try {
    body = (await request.json()) as DocumentGenerationRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Validate ──
  if (!body.templateId || !body.courtSettings?.state || !body.courtSettings?.county || !body.petitioner?.name || !body.caseType) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Rate limit (only after valid request) ──
  const rl = checkRateLimit(userId, 'document_generation');
  if (!rl.allowed) {
    const { body: rlBody, status } = rateLimitResponse(rl);
    return new Response(JSON.stringify(rlBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Stream response ──
  const stream = new ReadableStream({
    async start(controller) {
      // Listen for client disconnect
      const abortHandler = () => { try { controller.close(); } catch { /* already closed */ } };
      request.signal.addEventListener('abort', abortHandler);

      /** Check if the client has disconnected. */
      const isAborted = () => request.signal.aborted;
      if (isAborted()) {
        abortHandler();
        request.signal.removeEventListener('abort', abortHandler);
        return;
      }

      try {
        // Step 1: Analyzing Legal Frameworks
        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'analyzing',
          message: 'Analyzing Legal Frameworks',
          progress: 10,
          status: 'active',
        })));

        const template = getTemplate(body.templateId);
        if (!template) {
          controller.enqueue(new TextEncoder().encode(encodeEvent({
            step: 'error',
            message: `Template "${body.templateId}" not found`,
            progress: 0,
            status: 'error',
          })));
          return;  // finally block will close the controller
        }

        if (isAborted()) return;

        const normalizedState = titleCase(body.courtSettings.state);
        const normalizedCounty = titleCase(body.courtSettings.county);
        const rules = getMergedRules(normalizedState, normalizedCounty, body.formattingOverrides ?? {});

        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'analyzing',
          message: 'Analyzing Legal Frameworks',
          progress: 20,
          status: 'complete',
        })));

        // Step 2: Drafting Document Structure
        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'drafting',
          message: 'Drafting Document Structure',
          progress: 35,
          status: 'active',
        })));

        // Build caption
        const caption: CaptionData = body.caption ?? buildStreamCaption(body, normalizedState, normalizedCounty);
        const titleText = template.sections.find(s => s.type === 'title')?.title ?? template.title;

        await sleep(500); // Allow UI to show step

        if (isAborted()) return;

        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'drafting',
          message: 'Drafting Document Structure',
          progress: 45,
          status: 'complete',
        })));

        // Step 3: Applying Court Formatting
        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'formatting',
          message: 'Applying Court Formatting',
          progress: 55,
          status: 'active',
        })));

        if (isAborted()) return;

        const html = renderDocumentHTML({
          template,
          caption,
          titleText: titleText.toUpperCase(),
          bodyContent: body.bodyContent ?? [],
          petitioner: body.petitioner,
          respondentName: body.respondent?.name,
          exhibits: body.exhibits,
          rules,
          footerText: `Cause No. ${caption.causeNumber ?? ''} ${titleText}`,
        });

        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'formatting',
          message: 'Applying Court Formatting',
          progress: 65,
          status: 'complete',
        })));

        // Step 4: NEXXverification Compliance
        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'compliance',
          message: 'NEXXverification Compliance',
          progress: 75,
          status: 'active',
        })));

        if (isAborted()) return;

        const complianceChecks = quickComplianceCheck(html, rules);

        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'compliance',
          message: 'NEXXverification Compliance',
          progress: 80,
          status: 'complete',
        })));

        // Step 5: Generating PDF
        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'pdf',
          message: 'Rendering PDF',
          progress: 85,
          status: 'active',
        })));

        if (isAborted()) return;

        const pdfBytes = await renderHTMLToPDF(html, rules, caption.causeNumber);
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        const filename = `${template.id}_${Date.now()}.pdf`;

        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'pdf',
          message: 'Rendering PDF',
          progress: 95,
          status: 'complete',
        })));

        // Final: Complete
        controller.enqueue(new TextEncoder().encode(encodeEvent({
          step: 'complete',
          message: 'Document Ready',
          progress: 100,
          status: 'complete',
          result: {
            html,
            pdfBase64,
            compliance: complianceChecks,
            filename,
          },
        })));
      } catch (error) {
        if (
          request.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) return;
        console.error('[Stream Generation Error]', error);
        try {
          controller.enqueue(new TextEncoder().encode(encodeEvent({
            step: 'error',
            message: 'Document generation failed',
            progress: 0,
            status: 'error',
          })));
        } catch { /* controller may already be closed */ }
      } finally {
        request.signal.removeEventListener('abort', abortHandler);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}


/** Build a default caption from the request data for the streaming generation route. */
function buildStreamCaption(
  body: DocumentGenerationRequest,
  normalizedState: string,
  normalizedCounty: string,
): CaptionData {
  const { courtSettings, petitioner, respondent, children, caseType } = body;

  const isSAPCR = ['divorce_with_children', 'custody_establishment', 'custody_modification', 'sapcr', 'child_support', 'child_support_modification', 'visitation', 'relocation'].includes(caseType);

  // Filter to children with valid name strings to prevent runtime crashes
  const validChildren = (children ?? []).filter(
    (c): c is { name: string } => typeof c?.name === 'string' && c.name.trim().length > 0
  );

  let leftLines: string[];
  if (isSAPCR && validChildren.length > 0) {
    leftLines = ['IN THE INTEREST OF', '', ...validChildren.map(c => `${c.name.toUpperCase()},`), '', validChildren.length === 1 ? 'A CHILD' : 'CHILDREN'];
  } else {
    leftLines = [`${petitioner.name.toUpperCase()},`, 'Petitioner', '', 'v.', '', `${respondent?.name?.toUpperCase() ?? 'RESPONDENT'},`, 'Respondent'];
  }

  const trimmedCourtName = courtSettings.courtName?.trim();
  const rightLines = [
    trimmedCourtName
      ? `IN THE ${trimmedCourtName.toUpperCase()}`
      : 'IN THE DISTRICT COURT',
    courtSettings.judicialDistrict?.toUpperCase() ?? '',
    `${normalizedCounty.toUpperCase()} COUNTY, ${normalizedState.toUpperCase()}`,
  ].filter(Boolean);

  return {
    causeNumber: body.caption?.causeNumber ?? '_______________',
    leftLines,
    rightLines,
    style: normalizedState === 'Texas' ? 'section-symbol' : 'versus',
  };
}

/** Return a promise that resolves after the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

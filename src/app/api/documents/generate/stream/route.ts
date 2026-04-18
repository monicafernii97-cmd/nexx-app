/**
 * Document Generation Streaming API Route
 *
 * POST /api/documents/generate/stream
 *
 * Streams real-time progress updates during document generation via SSE.
 * PDF is validated, stored to Convex, and a download URL is returned.
 * No binary data (HTML/base64) is ever sent over the SSE stream.
 */

import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchMutation } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { getMergedRules } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import { renderDocumentHTML } from '@/lib/legal/templateRenderer';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { quickComplianceCheck } from '@/lib/legal/complianceChecker';
import type { DocumentGenerationRequest, CaptionData } from '@/lib/legal/types';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { titleCase } from '@/lib/utils/stringHelpers';
import { normalizeQuickGenerateLegalDocument } from '@/lib/document-generation/normalizeQuickGenerateLegalDocument';
import { validateGeneratedSections } from '@/lib/document-generation/validateGeneratedSections';
import { encodeSseEvent, encodeSseComment } from '@/lib/server/sse';
import { validatePdfBuffer } from '@/lib/pdf/validatePdf';

/** Force Node.js runtime for Puppeteer compatibility. */
export const runtime = 'nodejs';

/** Maximum serverless function duration in seconds. */
export const maxDuration = 60;

/** Handle POST requests to stream document generation progress via SSE. */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

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
  if (!body.templateId || !body.courtSettings?.state || !body.petitioner?.name) {
    return new Response(JSON.stringify({ error: 'Missing required fields: templateId, courtSettings.state, and petitioner.name are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Default optional fields
  if (!body.courtSettings.county) body.courtSettings.county = '';

  // ── Rate limit (only after valid request) ──
  const rl = checkRateLimit(userId, 'document_generation');
  if (!rl.allowed) {
    const { body: rlBody, status } = rateLimitResponse(rl);
    return new Response(JSON.stringify(rlBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── SSE Stream ──
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const abortHandler = () => {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', abortHandler);

      const isAborted = () => request.signal.aborted;

      /** Emit a progress event. */
      const sendProgress = (step: string, message: string, progress: number) => {
        controller.enqueue(encodeSseEvent('progress', { step, message, progress }, requestId));
      };

      try {
        // Connected event
        controller.enqueue(encodeSseEvent('connected', { requestId, ok: true }, requestId));

        // Keep-alive heartbeat every 15s
        heartbeat = setInterval(() => {
          try { controller.enqueue(encodeSseComment('keep-alive')); }
          catch { clearInterval(heartbeat); }
        }, 15_000);

        // ── Step 1: Analyzing Legal Frameworks ──
        sendProgress('analyzing', 'Analyzing Legal Frameworks', 10);

        const template = getTemplate(body.templateId);
        if (!template) {
          controller.enqueue(encodeSseEvent('error', {
            message: `Template "${body.templateId}" not found`,
            code: 'TEMPLATE_NOT_FOUND',
          }, requestId));
          return;
        }

        // Infer caseType from template when caller omits it
        if (!body.caseType) {
          body.caseType = template.caseTypes[0] ?? 'other';
        }

        if (isAborted()) return;

        const normalizedState = titleCase(body.courtSettings.state);
        const normalizedCounty = titleCase(body.courtSettings.county);
        const rules = getMergedRules(normalizedState, normalizedCounty, body.formattingOverrides ?? {});

        sendProgress('analyzing', 'Analyzing Legal Frameworks', 20);

        // ── Step 2: Normalizing Content ──
        sendProgress('normalizing', 'Normalizing Document Content', 30);

        const normalized = normalizeQuickGenerateLegalDocument(body.bodyContent);
        const flatText = Array.isArray(body.bodyContent)
          ? (body.bodyContent as Array<{ paragraphs?: string[] }>)
              .flatMap(i => i.paragraphs ?? [])
              .join('\n')
          : '';
        const validatedSections = validateGeneratedSections(normalized.sections, flatText);

        console.log(`[QuickGen:${requestId}] normalizationMode=${normalized.normalizationMode}, sections=${validatedSections.length}`);

        // Build caption — override with parsed metadata when available
        const caption: CaptionData = body.caption ?? buildStreamCaption(body, normalizedState, normalizedCounty);

        // Override caption with parsed shell metadata
        if (normalized.causeNumber) caption.causeNumber = normalized.causeNumber;
        if (normalized.caseStyleLeft?.length) caption.leftLines = normalized.caseStyleLeft;
        if (normalized.caseStyleRight?.length) caption.rightLines = normalized.caseStyleRight;

        // Override title with parsed title
        const defaultTitle = template.sections.find(s => s.type === 'title')?.title ?? template.title;
        const titleText = normalized.title ?? defaultTitle;

        // Override petitioner/signature with parsed values
        const petitionerData = {
          ...body.petitioner,
          ...(normalized.signatureName ? { name: normalized.signatureName } : {}),
          ...(normalized.signatureRole ? { role: normalized.signatureRole } : {}),
        };

        if (isAborted()) return;

        sendProgress('normalizing', 'Normalizing Document Content', 40);

        // ── Step 3: Applying Court Formatting ──
        sendProgress('formatting', 'Applying Court Formatting', 50);

        if (isAborted()) return;

        const html = await renderDocumentHTML({
          template,
          caption,
          titleText: titleText.toUpperCase(),
          bodyContent: validatedSections,
          petitioner: petitionerData,
          respondentName: normalized.respondentName ?? body.respondent?.name,
          exhibits: body.exhibits,
          rules,
        });

        if (!html || html.trim().length < 200) {
          throw new Error('Rendered HTML is empty or too small.');
        }

        sendProgress('formatting', 'Applying Court Formatting', 60);

        // ── Step 4: Compliance Check ──
        sendProgress('compliance', 'NEXXverification Compliance', 70);

        if (isAborted()) return;

        quickComplianceCheck(html, rules);

        sendProgress('compliance', 'NEXXverification Compliance', 75);

        // ── Step 5: Rendering PDF ──
        sendProgress('pdf', 'Rendering PDF', 80);

        if (isAborted()) return;

        const pdfBuffer = await renderHTMLToPDF(html, rules, caption.causeNumber);
        const { byteLength, sha256 } = validatePdfBuffer(pdfBuffer);

        const filename = buildPdfFilename(titleText, caption.causeNumber);

        console.log(`[QuickGen:${requestId}] PDF validated: ${byteLength} bytes, sha256=${sha256.slice(0, 12)}…`);

        sendProgress('pdf', 'Rendering PDF', 88);

        // ── Step 6: Storing PDF ──
        sendProgress('storing', 'Storing Document', 90);

        if (isAborted()) return;

        // Upload PDF to Convex storage
        const uploadUrl = await fetchMutation(api.documents.generateUploadUrl, {});
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(byteLength),
          },
          body: new Uint8Array(pdfBuffer),
          cache: 'no-store',
        });

        if (!uploadRes.ok) {
          throw new Error(`Storage upload failed (${uploadRes.status})`);
        }

        const { storageId } = (await uploadRes.json()) as { storageId?: string };
        if (!storageId) {
          throw new Error('Storage upload did not return storageId.');
        }

        // Create artifact record in Convex
        const artifact = await fetchMutation(api.quickGenerateArtifacts.createQuickGenArtifact, {
          storageId: storageId as never, // Convex ID type
          filename,
          byteSize: byteLength,
          sha256,
          requestId,
          templateId: body.templateId,
          templateTitle: titleText,
          caseType: body.caseType,
          courtState: normalizedState,
          courtCounty: normalizedCounty,
          petitionerName: petitionerData.name,
          respondentName: normalized.respondentName ?? body.respondent?.name,
          causeNumber: caption.causeNumber !== '_______________' ? caption.causeNumber : undefined,
        });

        console.log(`[QuickGen:${requestId}] Artifact stored: ${artifact.artifactId}`);

        sendProgress('storing', 'Storing Document', 95);

        // ── Final: Complete (metadata only — no binary) ──
        controller.enqueue(encodeSseEvent('complete', {
          artifactId: artifact.artifactId,
          filename: artifact.filename,
          byteLength: artifact.byteLength,
          sha256: artifact.sha256,
          downloadUrl: `/api/documents/generate/${artifact.artifactId}/download`,
        }, requestId));

        clearInterval(heartbeat);

        // Small flush cushion — payload is tiny so this is just safety
        await new Promise(r => setTimeout(r, 50));
      } catch (error) {
        clearInterval(heartbeat);
        if (request.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;

        const message = error instanceof Error ? error.message : 'Document generation failed';
        console.error(`[QuickGen:${requestId}] FAILED`, error);

        try {
          controller.enqueue(encodeSseEvent('error', {
            message,
            code: 'QUICK_GENERATE_FAILED',
          }, requestId));
          await new Promise(r => setTimeout(r, 50));
        } catch { /* controller may already be closed */ }
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener('abort', abortHandler);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
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

  /** Filter to children with valid name strings to prevent runtime crashes. */
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
    normalizedCounty
      ? `${normalizedCounty.toUpperCase()} COUNTY, ${normalizedState.toUpperCase()}`
      : normalizedState.toUpperCase(),
  ].filter(Boolean);

  return {
    causeNumber: body.caption?.causeNumber ?? '_______________',
    leftLines,
    rightLines,
    style: normalizedState === 'Texas' ? 'section-symbol' : 'versus',
  };
}

/** Build a descriptive PDF filename from the document title and cause number. */
function buildPdfFilename(title: string, causeNumber?: string): string {
  const safeTitle = (title || 'document')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);

  const cause = (causeNumber && causeNumber !== '_______________')
    ? causeNumber.replace(/[^\w\-]+/g, '_').slice(0, 50)
    : '';

  const datePart = new Date().toISOString().slice(0, 10);

  return cause
    ? `${safeTitle}_${cause}_${datePart}.pdf`
    : `${safeTitle}_${datePart}.pdf`;
}

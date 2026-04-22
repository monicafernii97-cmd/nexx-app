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
import { api } from '@convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { getTemplate } from '@/lib/legal/templates';
import type { DocumentGenerationRequest } from '@/lib/legal/types';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { titleCase } from '@/lib/utils/stringHelpers';
import { generateLegalPDF } from '@/lib/legal-docs/generateLegalPDF';
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
  // ── Convex client (must be created BEFORE the stream — Clerk auth context
  //    is not available inside the ReadableStream start() callback) ──
  let convex;
  try {
    convex = await getAuthenticatedConvexClient();
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to authenticate with Convex' }), {
      status: 401,
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

        // Flatten raw pasted content into a single string for parsing
        const rawText = Array.isArray(body.bodyContent)
          ? (body.bodyContent as Array<{ heading?: string; paragraphs?: string[]; content?: string; numberedItems?: string[] }>)
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
          : String(body.bodyContent ?? '');

        // Infer caseType from template when caller omits it
        if (!body.caseType) {
          const template = getTemplate(body.templateId);
          body.caseType = template?.caseTypes[0] ?? 'other';
        }

        // Resolve fallback title from template (for UNTITLED DOCUMENT)
        const fallbackTitle = (() => {
          const template = getTemplate(body.templateId);
          if (!template) return undefined;
          return template.sections.find(s => s.type === 'title')?.title ?? template.title;
        })();

        if (isAborted()) return;
        sendProgress('analyzing', 'Analyzing Legal Frameworks', 20);

        // ── Step 2: Generate via canonical pipeline ──
        sendProgress('normalizing', 'Parsing Legal Document Structure', 30);

        const legalPdf = await generateLegalPDF({
          rawText,
          convexQuery: () => convex.query(api.courtSettings.get, {}),
          payloadFallback: body.courtSettings,
          fallbackTitle,
        });

        if (isAborted()) return;
        sendProgress('formatting', 'Resolving Jurisdiction Profile', 50);

        console.log(`[QuickGen:${requestId}] type=${legalPdf.documentType}, jurisdiction=${legalPdf.jurisdictionProfile.key}, profile="${legalPdf.jurisdictionProfile.name}"`);
        console.log(`[QuickGen:${requestId}] parsed: ${legalPdf.parsed.sections.length} sections, title="${legalPdf.parsed.title.main}"`);
        if (legalPdf.validation.warnings.length) {
          console.warn(`[QuickGen:${requestId}] validation warnings:`, legalPdf.validation.warnings);
        }

        sendProgress('formatting', 'Rendering Legal Pleading HTML', 60);

        // ── Step 3: Validate PDF ──
        sendProgress('compliance', 'Validating Document Structure', 70);

        if (isAborted()) return;

        const { byteLength, sha256 } = validatePdfBuffer(legalPdf.pdfBuffer);

        const titleText = legalPdf.parsed.title.main;
        const causeNumber = legalPdf.parsed.metadata.causeNumber;
        const filename = legalPdf.filename;

        // Derive venue metadata from court settings (canonical source)
        const normalizedState = titleCase(body.courtSettings.state);
        const normalizedCounty = titleCase(body.courtSettings.county);

        console.log(`[QuickGen:${requestId}] PDF validated: ${byteLength} bytes, sha256=${sha256.slice(0, 12)}…`);

        sendProgress('pdf', 'Generating PDF', 85);

        // ── Step 6: Storing PDF ──
        sendProgress('storing', 'Storing Document', 90);

        if (isAborted()) return;

        // Upload PDF to Convex storage (30s timeout to prevent hanging)
        const uploadUrl = await convex.mutation(api.documents.generateUploadUrl, {});
        const uploadController = new AbortController();
        const uploadTimeout = setTimeout(() => uploadController.abort(), 30_000);

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(byteLength),
          },
          body: new Uint8Array(legalPdf.pdfBuffer),
          cache: 'no-store',
          signal: uploadController.signal,
        });


        clearTimeout(uploadTimeout);

        if (!uploadRes.ok) {
          throw new Error(`Storage upload failed (${uploadRes.status})`);
        }

        const uploadResult = await uploadRes.json();
        const storageId = uploadResult?.storageId;
        if (!storageId) {
          throw new Error('Storage upload did not return storageId.');
        }

        // Create artifact record in Convex
        const artifact = await convex.mutation(api.quickGenerateArtifacts.createQuickGenArtifact, {
          storageId,
          filename,
          byteSize: byteLength,
          sha256,
          requestId,
          templateId: body.templateId,
          templateTitle: titleText,
          caseType: body.caseType,
          courtState: normalizedState,
          courtCounty: normalizedCounty,
          petitionerName: body.petitioner.name,
          respondentName: body.respondent?.name,
          causeNumber: causeNumber,
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

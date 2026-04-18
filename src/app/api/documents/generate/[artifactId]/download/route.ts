/**
 * PDF Download Route
 *
 * GET /api/documents/generate/[artifactId]/download
 *
 * Serves a stored PDF with proper Content-Disposition headers.
 * Auth-guarded via Clerk — only the document owner can download.
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    artifactId: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  // ── Auth guard ──
  const { userId } = await auth();
  if (!userId) {
    return new Response('Authentication required', { status: 401 });
  }

  const { artifactId } = await context.params;

  // Fetch artifact info from Convex (ownership-checked in the query)
  let info: Awaited<ReturnType<typeof fetchQuery<typeof api.quickGenerateArtifacts.getQuickGenDownloadInfo>>>;
  try {
    info = await fetchQuery(api.quickGenerateArtifacts.getQuickGenDownloadInfo, {
      artifactId: artifactId as Id<'generatedDocuments'>,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Invalid') || msg.includes('validation') || msg.includes('is not a valid ID')) {
      return new Response('Invalid artifact id.', { status: 400 });
    }
    throw err;
  }

  if (!info) {
    return new Response('PDF not found.', { status: 404 });
  }

  // Fetch the PDF from Convex storage (30s timeout)
  const fetchController = new AbortController();
  const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000);

  let upstream: Response;
  try {
    upstream = await fetch(info.storageUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: fetchController.signal,
    });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    console.error(
      `[Download] Storage fetch ${isAbort ? 'timed out' : 'failed'} for ${artifactId}:`,
      error,
    );
    return new Response('Stored PDF could not be retrieved.', { status: 502 });
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`[Download] Storage fetch failed for ${artifactId}: ${upstream.status}`);
    return new Response('Stored PDF could not be retrieved.', { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      ...(info.byteLength > 0 ? { 'Content-Length': String(info.byteLength) } : {}),
      'Content-Disposition': contentDispositionAttachment(info.filename),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Build a standards-compliant Content-Disposition header (RFC 5987). */
function contentDispositionAttachment(filename: string): string {
  const fallback = filename.replace(/["\\\r\n]/g, '_');
  const encoded = encodeRFC5987ValueChars(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function encodeRFC5987ValueChars(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

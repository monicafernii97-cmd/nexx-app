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
  const info = await fetchQuery(api.quickGenerateArtifacts.getQuickGenDownloadInfo, {
    artifactId: artifactId as Id<'generatedDocuments'>,
  });

  if (!info) {
    return new Response('PDF not found.', { status: 404 });
  }

  // Fetch the PDF from Convex storage (30s timeout)
  const fetchController = new AbortController();
  const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000);

  const upstream = await fetch(info.storageUrl, {
    method: 'GET',
    cache: 'no-store',
    signal: fetchController.signal,
  });

  clearTimeout(fetchTimeout);

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
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}

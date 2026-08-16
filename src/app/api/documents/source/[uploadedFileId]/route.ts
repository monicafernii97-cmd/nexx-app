import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ uploadedFileId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { userId, getToken } = await auth();
  if (!userId) return new Response('Authentication required', { status: 401 });

  const { uploadedFileId } = await context.params;
  try {
    const token = await getToken({ template: 'convex' });
    if (!token) return new Response('Authentication required', { status: 401 });
    const siteUrl = convexSiteUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let upstream: Response;
    try {
      upstream = await fetch(`${siteUrl}/document-source?uploadedFileId=${encodeURIComponent(uploadedFileId)}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!upstream.ok || !upstream.body) {
      const status = upstream.status === 400 || upstream.status === 401 || upstream.status === 404 ? upstream.status : 502;
      return new Response(await upstream.text(), { status, headers: { 'Cache-Control': 'no-store' } });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
        ...(upstream.headers.get('content-disposition') ? { 'Content-Disposition': upstream.headers.get('content-disposition')! } : {}),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid|validation|valid id/i.test(message)) return new Response('Invalid source document id', { status: 400 });
    console.error('[DocumentSource] Authorized source proxy failed', { uploadedFileId, message });
    return new Response('Source document could not be retrieved', { status: 502 });
  }
}

function convexSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!configured) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
  return configured.replace(/\.convex\.cloud\/?$/, '.convex.site').replace(/\/$/, '');
}

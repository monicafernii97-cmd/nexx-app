import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from 'next/server';
import { isProbePathname } from '@/lib/security/probePaths';

/**
 * Only real app routes that require auth belong here. Unknown scanner URLs
 * should never be protected as though they were legitimate app pages.
 */
const isProtectedPageRoute = createRouteMatcher([
  '/chat(.*)',
  '/court-settings(.*)',
  '/dashboard(.*)',
  '/docuvault(.*)',
  '/efiling(.*)',
  '/incident-report(.*)',
  '/nex-profile(.*)',
  '/account(.*)',
  '/billing(.*)',
  '/cases(.*)',
  '/documents(.*)',
  '/profile(.*)',
  '/resources(.*)',
  '/settings(.*)',
  '/subscription(.*)',
]);

const isProtectedApiRoute = createRouteMatcher([
  '/api/analyze-document(.*)',
  '/api/audio/transcribe(.*)',
  '/api/chat(.*)',
  '/api/court-documents(.*)',
  '/api/court-rules(.*)',
  '/api/documents/check(.*)',
  '/api/documents/export(.*)',
  '/api/documents/generate(.*)',
  '/api/documents/parse(.*)',
  '/api/incidents(.*)',
  '/api/legal(.*)',
  '/api/pins(.*)',
  '/api/realtime/session(.*)',
  '/api/resources(.*)',
  '/api/review(.*)',
  '/api/stripe/checkout(.*)',
  '/api/stripe/portal(.*)',
  '/api/tts(.*)',
  '/api/upload(.*)',
  '/api/vector-store(.*)',
  '/api/workspace(.*)',
]);

/** Return a JSON auth failure for protected APIs instead of rendering sign-in HTML. */
function unauthorizedApiResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized' },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

/** Return a cacheable empty 404 for scanner probes that should not reach Clerk. */
function hardNotFound(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: {
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

const clerk = clerkMiddleware(async (auth, req) => {
  if (isProtectedApiRoute(req)) {
    const { userId } = await auth();

    if (!userId) {
      return unauthorizedApiResponse();
    }
  }

  if (isProtectedPageRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next();
});

/** Run probe blocking before Clerk and then enforce explicit app/API protection. */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  /**
   * Vercel Firewall should catch these first in production. This fallback keeps
   * probe traffic from becoming Clerk auth or /sign-in rendering work.
   */
  if (isProbePathname(req.nextUrl.pathname)) {
    return hardNotFound();
  }

  return clerk(req, event);
}

export const config = {
  matcher: [
    /**
     * Skip Next internals and ordinary static files. Keep JSON out of this list
     * so credentials.json and service-account.json can be caught as probes.
     */
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|avif|ttf|otf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|map|txt|xml)).*)',

    /**
     * Run for API routes so protected APIs still get Clerk auth. Probe fallback
     * catches /api/.env before Clerk.
     */
    '/(api|trpc)(.*)',

    /**
     * Preserve Clerk frontend API behavior.
     */
    '/__clerk/(.*)',
  ],
};

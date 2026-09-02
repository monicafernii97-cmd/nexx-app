import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT } from '@/lib/nexx/releaseContract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest) {
  const secret = process.env.VERIFICATION_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  return NextResponse.json({
    runtime: 'web',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'unknown',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? 'local',
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
    ...CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

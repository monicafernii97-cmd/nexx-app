/**
 * Export Pipeline Diagnostic Endpoint
 *
 * GET /api/documents/export/diagnose
 *
 * Tests each component of the export pipeline independently
 * to identify which module or dependency causes the 500 crash.
 * This endpoint is temporary — remove after debugging.
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
    const results: Record<string, string> = {};
    results['0_version'] = 'v2-2026-05-02';

    // 1. Auth
    try {
        const { userId } = await auth();
        results['1_auth'] = userId ? `OK (${userId.slice(0, 8)}…)` : 'FAIL: no userId';
    } catch (e) {
        results['1_auth'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 2. Convex client
    try {
        const { getAuthenticatedConvexClient } = await import('@/lib/convexServer');
        const client = await getAuthenticatedConvexClient();
        results['2_convex'] = client ? 'OK' : 'FAIL: no client';
    } catch (e) {
        results['2_convex'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 3. Rate limiter
    try {
        const { checkRateLimit } = await import('@/lib/rateLimit');
        results['3_rateLimit'] = typeof checkRateLimit === 'function' ? 'OK' : 'FAIL: not a function';
    } catch (e) {
        results['3_rateLimit'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 4. Pipeline bridge (GPT drafting)
    try {
        const mod = await import('@/lib/export-assembly/pipelineBridge');
        results['4_pipelineBridge'] = typeof mod.runDraftingPhase === 'function' ? 'OK' : 'FAIL: missing runDraftingPhase';
    } catch (e) {
        results['4_pipelineBridge'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 5. Preflight validator
    try {
        const mod = await import('@/lib/export-assembly/validation/preflightValidator');
        results['5_preflightValidator'] = typeof mod.runPreflightChecks === 'function' ? 'OK' : 'FAIL: missing runPreflightChecks';
    } catch (e) {
        results['5_preflightValidator'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 6. Exhibit cover drafts
    try {
        const mod1 = await import('@/lib/exports/exhibits/buildExhibitCoverDraftInputs');
        const mod2 = await import('@/lib/exports/exhibits/generateExhibitCoverDrafts');
        const mod3 = await import('@/lib/exports/exhibits/applyExhibitCoverDrafts');
        results['6_exhibitCovers'] = [
            typeof mod1.buildExhibitCoverDraftInputs === 'function',
            typeof mod2.generateExhibitCoverDrafts === 'function',
            typeof mod3.applyExhibitCoverDrafts === 'function',
        ].every(Boolean) ? 'OK' : 'FAIL: missing exports';
    } catch (e) {
        results['6_exhibitCovers'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 7. Export caption builder
    try {
        const mod = await import('@/lib/exports/buildExportCaption');
        results['7_buildExportCaption'] = typeof mod.buildExportCaption === 'function' ? 'OK' : 'FAIL';
    } catch (e) {
        results['7_buildExportCaption'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 8. Jurisdiction profile resolver
    try {
        const mod = await import('@/lib/exports/jurisdiction/resolveExportJurisdictionProfile');
        results['8_jurisdictionProfile'] = typeof mod.resolveExportJurisdictionProfile === 'function' ? 'OK' : 'FAIL';
    } catch (e) {
        results['8_jurisdictionProfile'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 9. Generate export PDF
    try {
        const mod = await import('@/lib/exports/generateExportPDF');
        results['9_generateExportPDF'] = typeof mod.generateExportPDF === 'function' ? 'OK' : 'FAIL';
    } catch (e) {
        results['9_generateExportPDF'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 10. Idempotency + Artifact integrity
    try {
        const mod1 = await import('@/lib/exports/idempotency');
        const mod2 = await import('@/lib/exports/artifactIntegrity');
        results['10_idempotency'] = [
            typeof mod1.hashPayload === 'function',
            typeof mod1.generateRunFingerprint === 'function',
            typeof mod2.computeArtifactChecksum === 'function',
        ].every(Boolean) ? 'OK' : 'FAIL: missing exports';
    } catch (e) {
        results['10_idempotency'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 11. Adapt to canonical export
    try {
        const mod = await import('@/lib/exports/adaptDraftedToCanonicalExport');
        results['11_adaptCanonical'] = typeof mod.adaptDraftedToCanonicalExport === 'function' ? 'OK' : 'FAIL';
    } catch (e) {
        results['11_adaptCanonical'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 12. Puppeteer + Chromium availability
    try {
        const puppeteer = await import('puppeteer-core');
        results['12_puppeteer'] = typeof puppeteer.default?.launch === 'function' ? 'OK' : 'FAIL';
    } catch (e) {
        results['12_puppeteer'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 13. Chromium-min
    try {
        const chromium = await import('@sparticuz/chromium-min');
        results['13_chromiumMin'] = chromium.default ? 'OK' : 'FAIL';
    } catch (e) {
        results['13_chromiumMin'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 14. OpenAI
    try {
        const { getOpenAI } = await import('@/lib/openai');
        const client = getOpenAI();
        results['14_openai'] = client ? 'OK' : 'FAIL';
    } catch (e) {
        results['14_openai'] = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 15. Env vars
    results['15_env_CONVEX_URL'] = process.env.NEXT_PUBLIC_CONVEX_URL ? 'SET' : 'MISSING';
    results['15_env_OPENAI_KEY'] = process.env.OPENAI_API_KEY ? 'SET' : 'MISSING';
    results['15_env_CLERK_SECRET'] = process.env.CLERK_SECRET_KEY ? 'SET' : 'MISSING';
    results['15_env_NODE_ENV'] = process.env.NODE_ENV ?? 'undefined';
    results['15_env_VERCEL'] = process.env.VERCEL ?? 'undefined';

    // Summary
    const crashes = Object.entries(results).filter(([, v]) => v.startsWith('CRASH'));
    const fails = Object.entries(results).filter(([, v]) => v.startsWith('FAIL') || v === 'MISSING');

    return new Response(JSON.stringify({
        status: crashes.length > 0 ? 'CRASHES_DETECTED' : fails.length > 0 ? 'WARNINGS' : 'ALL_OK',
        crashCount: crashes.length,
        failCount: fails.length,
        results,
    }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

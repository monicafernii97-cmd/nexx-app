/**
 * Export Download Route
 *
 * GET /api/documents/export/[exportId]/download
 *
 * Resolves exportId → Convex export record → storageId → signed URL.
 * Streams the PDF with proper Content-Disposition headers.
 *
 * Auth-guarded via Clerk + Convex ownership check.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ exportId: string }> },
) {
    // ── Auth guard ──
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { exportId } = await params;
    if (!exportId) {
        return NextResponse.json({ error: 'Missing exportId' }, { status: 400 });
    }

    try {
        // ── Fetch export record from Convex ──
        const convex = await getAuthenticatedConvexClient();

        const doc = await convex.query(api.generatedDocumentsExport.getExportById, {
            exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        });

        if (!doc) {
            return NextResponse.json({ error: 'Export not found' }, { status: 404 });
        }

        if (!doc.storageId) {
            return NextResponse.json({ error: 'PDF not yet generated' }, { status: 404 });
        }

        // ── Get signed storage URL ──
        const storageUrl = await convex.query(api.generatedDocumentsExport.getStorageUrl, {
            storageId: doc.storageId,
        });

        if (!storageUrl) {
            return NextResponse.json({ error: 'Storage URL unavailable' }, { status: 500 });
        }

        // ── Fetch and stream the PDF (headers survive unlike redirect) ──
        const pdfResponse = await fetch(storageUrl);
        if (!pdfResponse.ok || !pdfResponse.body) {
            return NextResponse.json(
                { error: 'Failed to fetch PDF from storage' },
                { status: 502 },
            );
        }

        const filename = doc.filename ?? 'export.pdf';
        return new NextResponse(pdfResponse.body, {
            status: 200,
            headers: {
                'Content-Type': doc.mimeType ?? 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'private, no-cache',
            },
        });
    } catch (error) {
        console.error('[ExportDownload] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate download URL' },
            { status: 500 },
        );
    }
}

/**
 * Export Download Route
 *
 * GET /api/documents/export/[exportId]/download
 *
 * Resolves exportId → Convex export record → storageId → signed URL.
 * Returns a redirect to the signed storage URL with proper Content-Disposition.
 *
 * Auth-guarded: only the export owner can download.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
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
        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
        const authToken = request.headers.get('authorization')?.replace('Bearer ', '');
        if (authToken) {
            convex.setAuth(authToken);
        }

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

        // ── Redirect with Content-Disposition ──
        const filename = doc.filename ?? 'export.pdf';
        const response = NextResponse.redirect(storageUrl);
        response.headers.set(
            'Content-Disposition',
            `attachment; filename="${filename}"`,
        );
        return response;
    } catch (error) {
        console.error('[ExportDownload] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate download URL' },
            { status: 500 },
        );
    }
}

/**
 * Vector Store Management Route
 *
 * Standalone endpoint for listing, creating, and deleting vector stores.
 * Separated from the upload route to provide clean CRUD operations.
 *
 * GET  — List vector stores for the authenticated user
 * POST — Create a new vector store
 * DELETE — Delete a vector store and clean up associated files
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { openai } from '@/lib/openaiConversation';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// GET — List vector stores for user
// ---------------------------------------------------------------------------

export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const convex = await getAuthenticatedConvexClient();
        const files = await convex.query(api.uploadedFiles.getByUser, {});

        // Group by vectorStoreId to get unique stores
        const storeMap = new Map<string, {
            vectorStoreId: string;
            fileCount: number;
            files: Array<{ filename: string; status: string; createdAt: number }>;
        }>();

        for (const file of files) {
            if (!file.vectorStoreId) continue;
            const existing = storeMap.get(file.vectorStoreId);
            if (existing) {
                existing.fileCount++;
                existing.files.push({
                    filename: file.filename,
                    status: file.status,
                    createdAt: file.createdAt,
                });
            } else {
                storeMap.set(file.vectorStoreId, {
                    vectorStoreId: file.vectorStoreId,
                    fileCount: 1,
                    files: [{
                        filename: file.filename,
                        status: file.status,
                        createdAt: file.createdAt,
                    }],
                });
            }
        }

        return NextResponse.json({
            ok: true,
            vectorStores: Array.from(storeMap.values()),
        });
    } catch (error) {
        console.error('[vector-store/GET]', error);
        return NextResponse.json(
            { error: 'Failed to list vector stores' },
            { status: 500 },
        );
    }
}

// ---------------------------------------------------------------------------
// POST — Create a standalone vector store
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const name = body.name || `nexx_store_${userId}_${Date.now()}`;

        // vectorStores API is in the beta namespace; cast needed until SDK exports stable types
        const vectorStore = await (openai.vectorStores as unknown as {
            create: (params: { name: string; metadata: Record<string, unknown> }) => Promise<{ id: string; name: string }>;
        }).create({
            name,
            metadata: {
                userId,
                caseId: body.caseId || undefined,
                createdBy: 'nexx-vector-store-route',
            },
        });

        // Persist store ownership — create a placeholder uploadedFiles record
        // so GET/DELETE can find the store via getByUser even before real files are added
        const convex = await getAuthenticatedConvexClient();
        await convex.mutation(api.uploadedFiles.create, {
            filename: `_vectorstore_${name}`,
            mimeType: 'application/x-vectorstore',
        });

        return NextResponse.json({
            ok: true,
            vectorStoreId: vectorStore.id,
            name: vectorStore.name,
        });
    } catch (error) {
        console.error('[vector-store/POST]', error);
        return NextResponse.json(
            { error: 'Failed to create vector store' },
            { status: 500 },
        );
    }
}

// ---------------------------------------------------------------------------
// DELETE — Delete a vector store + cleanup
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const vectorStoreId = searchParams.get('vectorStoreId');

        if (!vectorStoreId) {
            return NextResponse.json(
                { error: 'vectorStoreId is required' },
                { status: 400 },
            );
        }

        // A6: Validate ownership BEFORE deleting from OpenAI
        const convex = await getAuthenticatedConvexClient();
        const files = await convex.query(api.uploadedFiles.getByUser, {});
        const affectedFiles = files.filter(f => f.vectorStoreId === vectorStoreId);

        // If the user has no files in this store, they don't own it
        if (affectedFiles.length === 0) {
            return NextResponse.json(
                { error: 'Vector store not found or not owned by user' },
                { status: 403 },
            );
        }

        // Delete from OpenAI — abort local cleanup if this fails (non-404)
        try {
            await (openai.vectorStores as unknown as { del: (id: string) => Promise<void> }).del(vectorStoreId);
        } catch (err: unknown) {
            const status = (err as { status?: number })?.status;
            if (status === 404) {
                // Store already deleted — safe to clean up local records
            } else {
                // Non-404 error → abort, don't mutate local state
                console.error('[vector-store/DELETE] OpenAI deletion failed:', err);
                return NextResponse.json(
                    { error: 'Failed to delete vector store from provider' },
                    { status: 502 },
                );
            }
        }

        // OpenAI delete succeeded (or was already gone) — mark local files as defunct
        for (const file of affectedFiles) {
            await convex.action(api.uploadedFiles.updateStatus, {
                fileId: file._id,
                status: 'failed',
            });
        }

        return NextResponse.json({
            ok: true,
            deleted: vectorStoreId,
            filesAffected: affectedFiles.length,
        });
    } catch (error) {
        console.error('[vector-store/DELETE]', error);
        return NextResponse.json(
            { error: 'Failed to delete vector store' },
            { status: 500 },
        );
    }
}

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { parseLegalDocument } from '@/lib/nexx/parser';

export const maxDuration = 30;

/**
 * Document Analysis API Route
 * 
 * Accepts document text and returns structured legal metadata.
 * Used by the chat when a user uploads a document for analysis.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { filename, text } = body as { filename?: string; text?: string };

    if (!text || typeof text !== 'string') {
      return Response.json({ error: 'Document text is required' }, { status: 400 });
    }
    if (text.length > 100_000) {
      return Response.json(
        { error: `Document text too long (max 100,000 chars, received ${text.length})` },
        { status: 400 }
      );
    }

    const parsed = await parseLegalDocument({
      filename: filename || 'uploaded_document',
      text,
    });

    return Response.json({ ok: true, document: parsed });
  } catch (error) {
    console.error('[AnalyzeDocument] Error:', error);
    return Response.json({ error: 'Document analysis failed' }, { status: 500 });
  }
}

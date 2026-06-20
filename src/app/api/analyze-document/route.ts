import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { parseLegalDocument } from '@/lib/nexx/parser';
import { buildDocumentContextSnippet, extractDocumentText } from '@/lib/nexx/documentExtraction';

export const maxDuration = 120;
const MAX_ANALYSIS_CHARS = 100_000;
const MAX_CHAT_CONTEXT_CHARS = 60_000;

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
    let filename = 'uploaded_document';
    let text: string | undefined;
    let extractionMeta: Awaited<ReturnType<typeof extractDocumentText>> | undefined;
    const extractOnly = req.nextUrl.searchParams.get('extractOnly') === '1';

    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const fileEntry = formData.get('file');
      if (!(fileEntry instanceof File)) {
        return Response.json({ error: 'No file provided' }, { status: 400 });
      }
      filename = fileEntry.name || filename;
      const extraction = await extractDocumentText(fileEntry);
      extractionMeta = extraction;
      if (!extraction.text) {
        return Response.json(
          { error: extraction.error || 'Could not extract readable text from the uploaded document' },
          { status: 422 }
        );
      }
      text = extraction.text;
      if (extractOnly) {
        return Response.json({
          ok: true,
          partial: true,
          filename,
          extractedText: buildDocumentContextSnippet(text, MAX_CHAT_CONTEXT_CHARS),
          extractionError: extraction.error,
          extractionCharCount: text.length,
          extractionMethod: extraction.method,
          ocrAttempted: extraction.ocrAttempted ?? false,
          pagesOcrProcessed: extraction.pagesOcrProcessed,
          pagesTotal: extraction.pagesTotal,
        });
      }
    } else {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }
      const jsonBody = body as { filename?: string; text?: string };
      filename = jsonBody.filename || filename;
      text = jsonBody.text;
    }

    if (!text || typeof text !== 'string') {
      return Response.json({ error: 'Document text is required' }, { status: 400 });
    }
    const originalCharCount = text.length;
    const analysisText = originalCharCount > MAX_ANALYSIS_CHARS
      ? text.slice(0, MAX_ANALYSIS_CHARS)
      : text;

    const parsed = await parseLegalDocument({
      filename,
      text: analysisText,
    });

    return Response.json({
      ok: true,
      document: parsed,
      truncated: originalCharCount > MAX_ANALYSIS_CHARS,
      originalCharCount,
      analyzedCharCount: analysisText.length,
      extractionMethod: extractionMeta?.method,
      ocrAttempted: extractionMeta?.ocrAttempted ?? false,
      pagesOcrProcessed: extractionMeta?.pagesOcrProcessed,
      pagesTotal: extractionMeta?.pagesTotal,
    });
  } catch (error) {
    console.error('[AnalyzeDocument] Error:', error);
    return Response.json({ error: 'Document analysis failed' }, { status: 500 });
  }
}

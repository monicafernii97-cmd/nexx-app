import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 30;

/**
 * POST /api/documents/parse
 * Accepts a JSON body with { filename, data } where data is a base64-encoded file.
 * Returns the extracted plain text content.
 */
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body = await request.json();
        const { filename, data } = body as { filename?: string; data?: string };

        if (!filename || !data) {
            return NextResponse.json({ error: 'Missing filename or data' }, { status: 400 });
        }

        const maxSize = 10 * 1024 * 1024; // 10 MB
        // Check base64 string length before decoding to avoid memory spikes.
        // Base64 encodes 3 bytes in 4 chars, so decoded ≈ data.length * 3/4.
        const estimatedDecodedSize = Math.floor((data.length * 3) / 4);
        if (estimatedDecodedSize > maxSize) {
            return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 });
        }

        const buffer = Buffer.from(data, 'base64');
        if (buffer.length > maxSize) {
            return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 });
        }

        const name = filename.toLowerCase();
        let text = '';

        if (name.endsWith('.pdf')) {
            const { PDFParse } = await import('pdf-parse');
            const pdf = new PDFParse({ data: new Uint8Array(buffer) });
            const result = await pdf.getText();
            text = result.text;
        } else if (name.endsWith('.docx')) {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) {
            text = buffer.toString('utf-8');
        } else {
            return NextResponse.json(
                { error: 'Unsupported file type. Please upload a PDF, DOCX, TXT, MD, or CSV file.' },
                { status: 400 }
            );
        }

        // Trim excessive whitespace
        text = text.replace(/\n{3,}/g, '\n\n').trim();

        if (!text) {
            return NextResponse.json(
                { error: 'Could not extract any text from this file. It may be image-based or empty.' },
                { status: 422 }
            );
        }

        return NextResponse.json({ text, filename, characters: text.length });
    } catch (error) {
        console.error('[Document Parse Error]', error);
        return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
    }
}

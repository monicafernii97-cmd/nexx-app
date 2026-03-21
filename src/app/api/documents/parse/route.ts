import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * POST /api/documents/parse
 * Accepts a multipart form-data file upload (.pdf, .docx, .txt, .md, .csv)
 * and returns the extracted plain text content.
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxSize) {
            return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 });
        }

        const name = file.name.toLowerCase();
        let text = '';

        if (name.endsWith('.pdf')) {
            const { PDFParse } = await import('pdf-parse');
            const buffer = Buffer.from(await file.arrayBuffer());
            const pdf = new PDFParse({ data: new Uint8Array(buffer) });
            const result = await pdf.getText();
            text = result.text;
        } else if (name.endsWith('.docx')) {
            const mammoth = await import('mammoth');
            const buffer = Buffer.from(await file.arrayBuffer());
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) {
            text = await file.text();
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

        return NextResponse.json({ text, filename: file.name, characters: text.length });
    } catch (error) {
        console.error('[Document Parse Error]', error);
        return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
    }
}

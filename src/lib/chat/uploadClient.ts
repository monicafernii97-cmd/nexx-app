import type { Id } from '@convex/_generated/dataModel';

export type ChatUploadResponse = {
    ok?: boolean;
    partial?: boolean;
    error?: string;
    fileId?: string;
    openaiFileId?: string;
    openaiTextFileId?: string;
    vectorStoreId?: string;
    filename?: string;
    extractedText?: string;
    extractionError?: string;
    extractionCharCount?: number;
    extractionMethod?: 'text' | 'ocr';
    ocrAttempted?: boolean;
    pagesOcrProcessed?: number;
    pagesTotal?: number;
    indexingError?: string;
};

/** Require extracted text before sending an upload-backed message to the assistant. */
function assertReadableExtractedText(upload: ChatUploadResponse) {
    if (upload.extractedText?.trim()) return;

    throw new Error(
        upload.extractionError
            ? `The file uploaded, but NEXX could not read its text yet: ${upload.extractionError}`
            : 'The file uploaded, but NEXX could not read any text from it yet.'
    );
}

/** Extract readable document text without indexing, used when full upload/indexing is unavailable. */
export async function extractFileForConversationFallback(file: File): Promise<ChatUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/analyze-document?extractOnly=1', {
        method: 'POST',
        body: formData,
    });
    const data = await response.json().catch(() => ({})) as ChatUploadResponse;

    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Fallback extraction failed with status ${response.status}`);
    }

    return data;
}

/** Return fallback extraction data, preserving the original upload transport error if fallback also fails. */
async function extractFallbackAfterUploadFailure(file: File, uploadError: unknown): Promise<ChatUploadResponse> {
    try {
        const fallbackData = await extractFileForConversationFallback(file);
        assertReadableExtractedText(fallbackData);
        return fallbackData;
    } catch (fallbackError) {
        const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
            `NEXX could not reach the upload service or fallback extractor. Upload error: ${uploadMessage}. Fallback error: ${fallbackMessage}.`
        );
    }
}

/** Upload, extract, index, and validate a chat attachment before creating the AI turn. */
export async function uploadFileForConversation(
    file: File,
    conversationId: Id<'conversations'> | string
): Promise<ChatUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversationId', String(conversationId));

    let response: Response;
    try {
        response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });
    } catch (uploadError) {
        const fallbackData = await extractFallbackAfterUploadFailure(file, uploadError);
        return {
            ...fallbackData,
            partial: true,
            indexingError: uploadError instanceof Error ? uploadError.message : String(uploadError),
        };
    }
    const data = await response.json().catch(() => ({})) as ChatUploadResponse;

    if (!response.ok || !data.ok) {
        if (response.status >= 500) {
            const fallbackData = await extractFallbackAfterUploadFailure(file, data.error || `Upload failed with status ${response.status}`);
            return {
                ...fallbackData,
                partial: true,
                indexingError: data.error || `Upload failed with status ${response.status}`,
            };
        }
        throw new Error(data.error || `Upload failed with status ${response.status}`);
    }

    assertReadableExtractedText(data);

    return data;
}

/** Build the chat turn content that carries extracted upload text to the assistant worker. */
export function buildUploadedFileMessage(message: string, file: File, upload: ChatUploadResponse) {
    const filename = upload.filename ?? file.name;
    const extractedText = upload.extractedText?.trim();
    const methodLabel = upload.extractionMethod === 'ocr'
        ? `\nExtraction method: OCR${upload.pagesOcrProcessed ? ` (${upload.pagesOcrProcessed}${upload.pagesTotal ? ` of ${upload.pagesTotal}` : ''} pages)` : ''}`
        : upload.extractionMethod === 'text'
            ? '\nExtraction method: embedded document text'
            : '';
    const extractionNote = upload.extractionError
        ? `\n\nExtraction note: ${upload.extractionError}`
        : '';
    const indexingNote = upload.indexingError
        ? `\nIndexing note: file-search indexing did not finish, so this answer should rely on the extracted text included below. (${upload.indexingError})`
        : '';
    const retrievalNote = upload.indexingError
        ? '\nRetrieval: extracted document text is included directly in this message; file search may not be available for this upload.'
        : upload.openaiTextFileId
            ? '\nRetrieval: extracted/OCR text was indexed as a companion text file when available. Use the extracted text first, then file search for details beyond the preview.'
            : '\nRetrieval: original file was indexed for file search.';

    if (extractedText) {
        return `${message}\n\nUploaded document: ${filename}\nFile ID: ${upload.fileId ?? 'pending'}${methodLabel}${retrievalNote}${indexingNote}\n\nExtracted text preview:\n\n${extractedText}${extractionNote}`;
    }

    // Defensive guard for future callers; uploadFileForConversation rejects unreadable uploads before this builder runs.
    return `${message}\n\nUploaded document: ${filename}\nFile ID: ${upload.fileId ?? 'pending'}${methodLabel}${retrievalNote}${indexingNote}\nNo readable extracted text was available in this chat turn. Do not analyze the document unless file search returns relevant document text.${extractionNote}`;
}

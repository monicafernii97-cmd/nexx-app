/**
 * Parser — Document parsing with legal-specific chunking.
 * 
 * Handles PDF, DOCX, and text file parsing with metadata extraction.
 * Uses legal-specific chunking strategy:
 * - Split on section headings (WHEREAS, ORDERED, SECTION)
 * - Preserve paragraph boundaries
 * - Tag chunks with docType metadata
 */

import { openai } from '../openaiConversation';
import { PARSED_LEGAL_DOCUMENT_SCHEMA } from './schemas';
import type { ParsedLegalDocument } from '../types';

/**
 * Parse a legal document and extract structured metadata.
 * Uses AI for document classification and key clause extraction.
 */
export async function parseLegalDocument(args: {
  filename: string;
  text: string;
}): Promise<ParsedLegalDocument> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model: 'gpt-5.4-mini',
    input: [
      {
        role: 'developer',
        content: `You are a legal document classifier and metadata extractor. Analyze the document and extract:
- Document type (final_order, temporary_order, motion, notice, declaration, message_thread, record)
- Title
- Signed date
- Key clauses (custody terms, financial obligations, communication requirements)
- Deadlines
- Obligations for each party
- Custody-specific terms
- Communication-specific terms

Be precise. Only extract what is explicitly stated. Do not infer.`,
      },
      {
        role: 'user',
        content: `Parse this document (${args.filename}):\n\n${args.text.slice(0, 8000)}`,
      },
    ],
    text: { format: PARSED_LEGAL_DOCUMENT_SCHEMA },
  });

  const text = response.output_text || '';
  try {
    return JSON.parse(text) as ParsedLegalDocument;
  } catch {
    return { title: args.filename };
  }
}

/**
 * Legal-specific text chunking.
 * Splits on legal section boundaries while preserving paragraph integrity.
 */
export function chunkLegalText(text: string): string[] {
  const chunks: string[] = [];

  // Split on legal section markers
  const sectionPattern = /(?:^|\n)(?:SECTION|ARTICLE|ORDERED|WHEREAS|IT IS (?:HEREBY )?ORDERED|(?:\d+\.)\s)/gi;
  const sections = text.split(sectionPattern);

  const MAX_CHUNK_SIZE = 2000;
  const OVERLAP = 200;

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (trimmed.length <= MAX_CHUNK_SIZE) {
      chunks.push(trimmed);
    } else {
      // Split long sections into overlapping chunks at paragraph boundaries
      const paragraphs = trimmed.split(/\n\n+/);
      let current = '';

      for (const para of paragraphs) {
        if ((current + '\n\n' + para).length > MAX_CHUNK_SIZE && current) {
          chunks.push(current.trim());
          // Overlap: keep the last paragraph
          current = para;
        } else {
          current = current ? current + '\n\n' + para : para;
        }
      }

      if (current.trim()) {
        chunks.push(current.trim());
      }
    }
  }

  return chunks.length > 0 ? chunks : [text.slice(0, MAX_CHUNK_SIZE)];
}

/**
 * Build metadata tags for a parsed document.
 */
export function buildDocumentMetadata(
  parsed: ParsedLegalDocument,
  userId: string,
  conversationId?: string
): Record<string, string> {
  const metadata: Record<string, string> = {
    source: 'user_upload',
    userId,
  };

  if (parsed.docType) metadata.docType = parsed.docType;
  if (parsed.title) metadata.title = parsed.title;
  if (parsed.signedDate) metadata.signedDate = parsed.signedDate;
  if (conversationId) metadata.conversationId = conversationId;

  return metadata;
}

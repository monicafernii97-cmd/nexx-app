/**
 * File Search — OpenAI vector store file search with metadata filters.
 * Handles per-case vector store strategy.
 */

import { getOpenAIClient, openai } from '../openaiConversation';
import type { VectorStoreFilter } from '../types';

type VectorStoreFileAttributes = Record<string, string | number | boolean>;

export function toVectorStoreFileAttributes(metadata?: VectorStoreFilter): VectorStoreFileAttributes | undefined {
  if (!metadata) return undefined;

  const attributes = Object.entries(metadata).reduce<VectorStoreFileAttributes>((acc, [key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = typeof value === 'string' ? value.slice(0, 512) : value;
    }
    return acc;
  }, {});

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

/**
 * Create a new vector store for a case/conversation.
 * Each case gets its own vector store for isolation.
 */
export async function createVectorStore(name: string): Promise<string> {
  const client = getOpenAIClient();
  const store = await client.vectorStores.create({ name }, { timeout: 15_000 });
  return store.id;
}

/**
 * Delete a vector store. Used to clean up orphaned stores
 * (race losers or failed standalone uploads).
 */
export async function deleteVectorStore(vectorStoreId: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (openai.vectorStores as any).del(vectorStoreId);
  } catch (err) {
    // Non-fatal — orphan will be cleaned up by OpenAI's retention policy
    console.warn('[FileSearch] Failed to delete vector store:', vectorStoreId, err);
  }
}

/**
 * Upload a file to OpenAI and attach it to a vector store.
 *
 * @param vectorStoreId - Target vector store ID.
 * @param file - File to upload.
 * @param metadata - Optional metadata filters (caseId, docType, jurisdiction).
 * @param chunkSize - Max chunk size in tokens (default: 800 for legal docs).
 * @param chunkOverlap - Token overlap between chunks (default: 200).
 * @returns The OpenAI file ID.
 */
export async function uploadToVectorStore(
  vectorStoreId: string,
  file: File,
  metadata?: VectorStoreFilter,
  chunkSize = 800,
  chunkOverlap = 200
): Promise<string> {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be a non-negative integer smaller than chunkSize');
  }

  // Upload file to OpenAI
  const client = getOpenAIClient();
  const uploadedFile = await client.files.create({
    file,
    purpose: 'assistants',
  }, { timeout: 30_000 });

  // Attach to vector store with custom chunking + attributes.
  // Legal documents benefit from smaller chunks (~800 tokens) vs default (4096)
  const attributes = toVectorStoreFileAttributes(metadata);
  try {
    await client.vectorStores.files.createAndPoll(vectorStoreId, {
      file_id: uploadedFile.id,
      ...(attributes ? { attributes } : {}),
      chunking_strategy: {
        type: 'static',
        static: {
          max_chunk_size_tokens: chunkSize,
          chunk_overlap_tokens: chunkOverlap,
        },
      },
    }, { timeout: 45_000 });
  } catch (attachError) {
    // Clean up orphaned file to prevent storage leaks
    try {
      await client.files.delete(uploadedFile.id);
    } catch {
      console.warn('[FileSearch] Failed to clean up orphaned file:', uploadedFile.id);
    }
    throw attachError;
  }

  return uploadedFile.id;
}

/**
 * Upload extracted/OCR text as a companion file for reliable retrieval.
 *
 * Scanned PDFs and complex legal PDFs can be hard for the original-file indexer
 * to search. A normalized text companion gives file_search a clean fallback.
 */
export async function uploadTextToVectorStore(
  vectorStoreId: string,
  filename: string,
  text: string,
  metadata?: VectorStoreFilter
): Promise<string> {
  const safeBase = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'uploaded-document';
  const textFile = new File([text], `${safeBase}.extracted.txt`, { type: 'text/plain' });

  return uploadToVectorStore(vectorStoreId, textFile, {
    ...metadata,
    source: 'extracted_text',
    originalFilename: filename,
  });
}

/**
 * Search a vector store with optional metadata filters.
 */
export async function searchVectorStore(args: {
  vectorStoreId: string;
  query: string;
  filter?: VectorStoreFilter;
  maxResults?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any[]> {
  // The file_search tool handles this automatically when wired into responses.create
  // This function is for manual/ad-hoc searches outside the chat flow
  try {
    const results = await openai.vectorStores.search(args.vectorStoreId, {
      query: args.query,
      max_num_results: args.maxResults || 10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(args.filter ? { filters: args.filter as any } : {}),
    });
    return results.data || [];
  } catch (error) {
    console.error('[FileSearch] Search failed:', error);
    return [];
  }
}

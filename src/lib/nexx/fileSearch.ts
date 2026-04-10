/**
 * File Search — OpenAI vector store file search with metadata filters.
 * Handles per-case vector store strategy.
 */

import { openai } from '../openaiConversation';
import type { VectorStoreFilter } from '../types';

/**
 * Create a new vector store for a case/conversation.
 * Each case gets its own vector store for isolation.
 */
export async function createVectorStore(name: string): Promise<string> {
  const store = await openai.vectorStores.create({ name });
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
 * Returns the OpenAI file ID.
 */
export async function uploadToVectorStore(
  vectorStoreId: string,
  file: File,
  metadata?: VectorStoreFilter
): Promise<string> {
  // Upload file to OpenAI
  const uploadedFile = await openai.files.create({
    file,
    purpose: 'assistants',
  });

  // Attach to vector store with metadata — wait until indexing is complete
  await openai.vectorStores.files.createAndPoll(vectorStoreId, {
    file_id: uploadedFile.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(metadata ? { metadata: metadata as any } : {}),
  });

  return uploadedFile.id;
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

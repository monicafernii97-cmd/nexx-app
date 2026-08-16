import OpenAI from 'openai';
import type { DocumentMemoryArtifacts } from './documentChunking';

export const DOCUMENT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DOCUMENT_EMBEDDING_DIMENSIONS = 512;
export const DOCUMENT_EMBEDDING_VERSION = 'canonical-chunk-v1';
const EMBEDDING_BATCH_SIZE = 64;

export type EmbeddedDocumentMemoryArtifacts = Omit<DocumentMemoryArtifacts, 'chunks'> & {
  chunks: Array<DocumentMemoryArtifacts['chunks'][number] & {
    embedding?: number[];
    embeddingModel?: string;
    embeddingVersion?: string;
  }>;
  embeddingUsage?: Array<{ inputTokens: number; providerRequestId?: string }>;
};

export async function createDocumentQueryEmbedding(client: OpenAI, text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 20_000);
  if (!normalized) return null;
  const response = await client.embeddings.create({
    model: DOCUMENT_EMBEDDING_MODEL,
    dimensions: DOCUMENT_EMBEDDING_DIMENSIONS,
    input: normalized,
    encoding_format: 'float',
  });
  const embedding = response.data[0]?.embedding;
  return embedding?.length === DOCUMENT_EMBEDDING_DIMENSIONS ? embedding : null;
}

/** Add semantic vectors to canonical chunks without changing their source text or ordinals. */
export async function embedDocumentMemoryArtifacts(
  artifacts: DocumentMemoryArtifacts,
  client?: OpenAI,
): Promise<EmbeddedDocumentMemoryArtifacts> {
  if (artifacts.chunks.length === 0 || (!client && !process.env.OPENAI_API_KEY)) return artifacts;
  const embeddingClient = client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 60_000 });
  const chunks: EmbeddedDocumentMemoryArtifacts['chunks'] = [];
  const embeddingUsage: Array<{ inputTokens: number; providerRequestId?: string }> = [];
  for (let start = 0; start < artifacts.chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = artifacts.chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await embeddingClient.embeddings.create({
      model: DOCUMENT_EMBEDDING_MODEL,
      dimensions: DOCUMENT_EMBEDDING_DIMENSIONS,
      input: batch.map((chunk) => [chunk.sectionHeading, chunk.text].filter(Boolean).join('\n\n').slice(0, 20_000)),
      encoding_format: 'float',
    });
    const requestId = (response as typeof response & { _request_id?: string })._request_id;
    embeddingUsage.push({
      inputTokens: response.usage?.total_tokens ?? response.usage?.prompt_tokens ?? 0,
      providerRequestId: requestId,
    });
    if (response.data.length !== batch.length) throw new Error('Embedding provider returned an incomplete chunk batch.');
    const embeddingsByIndex = new Map(response.data.map((item) => [item.index, item.embedding]));
    for (const [index, chunk] of batch.entries()) {
      const embedding = embeddingsByIndex.get(index);
      if (!embedding || embedding.length !== DOCUMENT_EMBEDDING_DIMENSIONS) {
        throw new Error(`Embedding provider returned an invalid vector for chunk ${chunk.chunkIndex}.`);
      }
      chunks.push({
        ...chunk,
        embedding,
        embeddingModel: DOCUMENT_EMBEDDING_MODEL,
        embeddingVersion: DOCUMENT_EMBEDDING_VERSION,
      });
    }
  }
  return { ...artifacts, chunks, embeddingUsage };
}

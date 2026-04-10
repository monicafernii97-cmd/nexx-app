/**
 * Retrieval Ranker — evidence re-ranking and compression into EvidencePackets.
 */

import { openai } from '../openaiConversation';
import { EVIDENCE_PACKET_SCHEMA } from './schemas';
import type { EvidencePacket, LocalCourtSource } from '../types';

/**
 * Re-rank and compress retrieved sources into an EvidencePacket.
 * Filters out irrelevant sources and identifies evidence gaps.
 */
export async function rankAndCompress(args: {
  query: string;
  sources: LocalCourtSource[];
}): Promise<EvidencePacket> {
  if (args.sources.length === 0) {
    return { keyPassages: [], unresolvedGaps: ['No sources retrieved'] };
  }

  const sourceText = args.sources
    .map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet}`)
    .join('\n\n');

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.responses as any).create({
      model: 'gpt-5.4-mini',
      input: [
        {
          role: 'developer',
          content: `You are a legal evidence ranker. Given a user query and a set of retrieved legal sources:

1. Identify the passages most relevant to the query
2. Extract the key excerpts and explain why each is relevant
3. Note any gaps — what information is needed but not found in the sources

Be precise. Only include sources that directly address the query.`,
        },
        {
          role: 'user',
          content: `Query: ${args.query}\n\nSources:\n${sourceText}`,
        },
      ],
      text: { format: EVIDENCE_PACKET_SCHEMA },
    });

    const text = response.output_text || '';
    return JSON.parse(text) as EvidencePacket;
  } catch {
    // Fallback: include all sources as-is
    return {
      keyPassages: args.sources.slice(0, 5).map((s) => ({
        sourceTitle: s.title,
        excerpt: s.snippet,
        reasonRelevant: 'Retrieved source — relevance not assessed',
      })),
      unresolvedGaps: ['Evidence ranking unavailable'],
    };
  }
}

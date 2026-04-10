/**
 * Legal Retriever — local court source retrieval with provenance.
 * Wraps the existing Tavily search with provenance tracking.
 */

import type { LocalCourtSource, CourtRuleProvenance } from '../types';
import { searchStatutes } from '../legal/search';

/**
 * Retrieve local court sources with provenance metadata.
 */
export async function retrieveLocalSources(args: {
  query: string;
  state: string;
  county?: string;
}): Promise<LocalCourtSource[]> {
  try {
    const results = await searchStatutes(args.state, args.query, args.county);

    return results.map((r) => ({
      title: r.title,
      url: r.url,
      sourceType: 'legal_search',
      snippet: r.snippet,
      jurisdiction: args.state,
      retrievedAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Build court rule provenance from retrieved sources.
 * Maps normalized rule fields back to their source snippets.
 */
export function buildProvenance(
  field: string,
  value: string,
  source: LocalCourtSource
): CourtRuleProvenance {
  return {
    field,
    value,
    sourceUrl: source.url,
    sourceSnippet: source.snippet.slice(0, 500),
    confidence: source.url.includes('.gov') ? 'high' : 'medium',
  };
}

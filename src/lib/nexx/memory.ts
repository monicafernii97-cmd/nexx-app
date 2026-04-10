/**
 * Memory — conversation compaction and case graph updates.
 * 
 * summarizeConversation(): compresses turns into a CompactedSummary
 * updateCaseGraph(): extracts case graph updates from recent messages
 * shouldCompact(): triggers every 6 turns
 */

import { openai } from '../openaiConversation';
import { CONVERSATION_SUMMARY_SCHEMA, CASE_GRAPH_UPDATE_SCHEMA } from './schemas';
import type { ConversationSummary } from '../types';
import type { CaseGraph } from './caseGraph';

/** Trigger compaction every N turns */
const COMPACTION_INTERVAL = 6;

export function shouldCompact(messageCount: number): boolean {
  return messageCount > 0 && messageCount % COMPACTION_INTERVAL === 0;
}

/**
 * Summarize a conversation into a CompactedSummary.
 * Preserves decisions, dates, key facts. Discards pleasantries.
 */
export async function summarizeConversation(args: {
  messages: Array<{ role: string; content: string }>;
  existingSummary?: ConversationSummary;
}): Promise<ConversationSummary> {
  const messageText = args.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const existingContext = args.existingSummary
    ? `\n\nExisting summary to update:\n${JSON.stringify(args.existingSummary)}`
    : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model: 'gpt-5.4-mini',
    input: [
      {
        role: 'developer',
        content: `You are a legal case summarizer. Extract and preserve ONLY:
- Key decisions made
- Important facts revealed
- Specific dates mentioned
- User's stated goals
- Unresolved questions that need follow-up

Discard: greetings, pleasantries, filler, emotional processing (unless it reveals case facts).
${existingContext}`,
      },
      {
        role: 'user',
        content: `Summarize this conversation segment:\n\n${messageText}`,
      },
    ],
    text: { format: CONVERSATION_SUMMARY_SCHEMA },
  });

  const text = response.output_text || '';
  try {
    return JSON.parse(text) as ConversationSummary;
  } catch {
    return {
      decisions: [],
      keyFacts: [],
      dates: [],
      goals: [],
      unresolvedQuestions: [],
      turnCount: args.messages.length,
    };
  }
}

/**
 * Extract case graph updates from recent messages.
 * Returns a partial CaseGraph with only the fields that were updated.
 */
export async function updateCaseGraph(args: {
  messages: Array<{ role: string; content: string }>;
  existingGraph?: CaseGraph;
}): Promise<Partial<CaseGraph>> {
  const messageText = args.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const existingContext = args.existingGraph
    ? `\n\nExisting case graph:\n${JSON.stringify(args.existingGraph)}`
    : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model: 'gpt-5.4-mini',
    input: [
      {
        role: 'developer',
        content: `You are a case intelligence extractor. From the conversation, extract any NEW information about:
- Jurisdiction (state, county, court type)
- Parties (names, roles, attorney status)
- Children (initials only — no full names)
- Custody structure
- Current orders
- Open issues and pending relief
- Timeline events
- Evidence themes
- Communication patterns
- Procedural state (hearings, deadlines)

Only return fields that have NEW information. Set unchanged fields to null.
${existingContext}`,
      },
      {
        role: 'user',
        content: `Extract case graph updates from:\n\n${messageText}`,
      },
    ],
    text: { format: CASE_GRAPH_UPDATE_SCHEMA },
  });

  const text = response.output_text || '';
  try {
    const parsed = JSON.parse(text);
    // Filter out null fields
    const updates: Partial<CaseGraph> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && value !== undefined) {
        (updates as Record<string, unknown>)[key] = value;
      }
    }
    return updates;
  } catch {
    return {};
  }
}

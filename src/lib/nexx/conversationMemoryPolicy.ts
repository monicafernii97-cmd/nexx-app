export type ConversationMemoryCandidate = {
  id?: string;
  role: string;
  content: string;
  status?: string;
  superseded?: boolean;
  turnNumber: number;
  roleOrder: number;
};

/** Return whether an edit or retry changed history already represented in memory. */
export function shouldInvalidateConversationSummary(args: {
  summaryTurnCount?: number;
  editedMessageId?: string;
  deletedMessageIds: ReadonlySet<string>;
  messages: Array<{ id: string; turnNumber: number }>;
}) {
  if (args.summaryTurnCount === undefined) return false;

  return args.messages.some((message) => {
    const changed =
      message.id === args.editedMessageId ||
      args.deletedMessageIds.has(message.id);
    return changed && message.turnNumber <= args.summaryTurnCount!;
  });
}

/** Select committed canonical messages within the requested compaction window. */
export function canonicalConversationMemoryPage(args: {
  messages: ConversationMemoryCandidate[];
  fromTurnExclusive: number;
  throughTurnInclusive: number;
}) {
  return args.messages
    .filter((message) =>
      (
        message.status === undefined ||
        message.status === 'committed'
      ) &&
      !message.superseded &&
      (message.role === 'user' || message.role === 'assistant') &&
      message.turnNumber > args.fromTurnExclusive &&
      message.turnNumber <= args.throughTurnInclusive
    )
    .sort((a, b) =>
      a.turnNumber === b.turnNumber
        ? a.roleOrder - b.roleOrder
        : a.turnNumber - b.turnNumber
    )
    .map(({ role, content }) => ({ role, content }));
}

/**
 * Preserve both the setup and the user's final refinement in very long turns
 * while strictly honoring the requested storage budget.
 */
export function compactConversationMemoryContent(value: string, maxChars = 12_000) {
  if (!Number.isFinite(maxChars)) return maxChars === Number.POSITIVE_INFINITY ? value : '';
  const budget = Math.max(0, Math.floor(maxChars));
  if (value.length <= budget) return value;
  if (budget === 0) return '';

  const omissionMarker = '\n\n[Earlier pasted content omitted during memory compaction]\n\n';
  if (budget <= omissionMarker.length) return value.slice(0, budget);

  const available = budget - omissionMarker.length;
  const headChars = Math.ceil(available * 0.58);
  const tailChars = available - headChars;
  const tail = tailChars > 0 ? value.slice(-tailChars) : '';
  return `${value.slice(0, headChars)}${omissionMarker}${tail}`;
}

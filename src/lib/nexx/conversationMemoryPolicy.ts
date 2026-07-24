export type ConversationMemoryCandidate = {
  id?: string;
  role: string;
  content: string;
  status?: string;
  turnNumber: number;
  roleOrder: number;
};

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

export function canonicalConversationMemoryPage(args: {
  messages: ConversationMemoryCandidate[];
  fromTurnExclusive: number;
  throughTurnInclusive: number;
}) {
  return args.messages
    .filter((message) =>
      (
        message.status === undefined ||
        message.status === 'committed' ||
        message.status === 'degraded'
      ) &&
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

/** Preserve both the setup and the user's final refinement in very long turns. */
export function compactConversationMemoryContent(value: string, maxChars = 12_000) {
  if (value.length <= maxChars) return value;
  const omissionMarker = '\n\n[Earlier pasted content omitted during memory compaction]\n\n';
  const available = Math.max(0, maxChars - omissionMarker.length);
  const headChars = Math.ceil(available * 0.58);
  const tailChars = available - headChars;
  return `${value.slice(0, headChars)}${omissionMarker}${value.slice(-tailChars)}`;
}

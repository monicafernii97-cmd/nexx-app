export type EvidenceMessage = {
  id: string;
  sender: string;
  timestamp: string;
  conversationId: string;
  text: string;
  ordinal: number;
  lineStart?: number;
  lineEnd?: number;
};
export const MESSAGE_PARSER_VERSION = "structured-json-whatsapp-text-v1";
/** Parse only explicit source structure. Dates/timezones and sender certainty are not inferred. */
export function parseEvidenceMessages(
  raw: string,
  mimeType: string,
): EvidenceMessage[] {
  if (raw.length > 2_000_000)
    throw new Error(
      "Message imports support up to 2 MB of text. Split larger exports.",
    );
  let messages: EvidenceMessage[] = [];
  if (mimeType === "application/json" || /^\s*(?:\{|\[\s*\{)/.test(raw)) {
    const parsed = JSON.parse(raw),
      records = Array.isArray(parsed) ? parsed : parsed.messages;
    if (!Array.isArray(records))
      throw new Error(
        "JSON requires a messages array with sender, timestamp, text, and optional conversationId/id.",
      );
    messages = records.map((m, i) => {
      if (
        !m ||
        typeof m.text !== "string" ||
        typeof m.sender !== "string" ||
        typeof m.timestamp !== "string" ||
        (m.id !== undefined && typeof m.id !== "string") ||
        (m.conversationId !== undefined && typeof m.conversationId !== "string")
      )
        throw new Error(
          `Message ${i + 1} is missing explicit text, sender, or timestamp fields.`,
        );
      if (m.attachments?.length)
        throw new Error(
          "This JSON references attachments. Import a text-only transcript and add the actual attachment files separately.",
        );
      return {
        id: m.id ?? `message-${i + 1}`,
        sender: m.sender,
        timestamp: m.timestamp,
        conversationId: m.conversationId ?? "Imported conversation",
        text: m.text,
        ordinal: i,
      };
    });
  } else {
    const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(
        /^(?:\[([^\]]+)\]\s*|([\d/.\-]+,?\s+[\d:]+(?:\s*[APap][Mm])?)\s+-\s+)(.*)$/,
      );
      if (match) {
        const body = match[3],
          separator = body.indexOf(": ");
        messages.push({
          id: `message-${messages.length + 1}`,
          sender:
            separator >= 0 ? body.slice(0, separator) : "System / unattributed",
          timestamp: match[1] ?? match[2],
          conversationId: "Imported conversation",
          text: separator >= 0 ? body.slice(separator + 2) : body,
          ordinal: messages.length,
          lineStart: i + 1,
          lineEnd: i + 1,
        });
      } else if (messages.length) {
        const message = messages[messages.length - 1];
        message.text += "\n" + line;
        message.lineEnd = i + 1;
      } else if (line.trim())
        throw new Error(
          "Unrecognized message export. Use a WhatsApp text export or structured JSON; arbitrary text is not silently interpreted as messages.",
        );
    }
  }
  if (!messages.length || messages.length > 10000)
    throw new Error("Select an export containing 1–10,000 messages.");
  if (
    new Set(messages.map((m) => m.id)).size !== messages.length ||
    messages.some(
      (m) =>
        !m.id ||
        m.id.length > 100 ||
        m.sender.length > 200 ||
        m.timestamp.length > 120 ||
        m.conversationId.length > 200 ||
        m.text.length > 30000,
    )
  )
    throw new Error("Duplicate message IDs or oversized message fields.");
  return messages;
}
export function selectEvidenceMessages(
  messages: EvidenceMessage[],
  ids?: string[],
) {
  if (!ids) return messages;
  const selected = new Set(ids);
  if (
    !selected.size ||
    selected.size !== ids.length ||
    ids.some((id) => !messages.some((m) => m.id === id))
  )
    throw new Error(
      "SELECTION_OUT_OF_RANGE: A selected message is missing from this source version.",
    );
  return messages.filter((m) => selected.has(m.id));
}

"use client";
import { useEffect, useState } from "react";
import {
  parseEvidenceMessages,
  type EvidenceMessage,
} from "../../../shared/exhibitMessages";
import type { ExhibitItem } from "../../../shared/exhibits";
export function MessageSelector({
  item,
  mimeType,
  onChange,
}: {
  item: ExhibitItem;
  mimeType: string;
  onChange: (patch: Partial<ExhibitItem>) => void;
}) {
  const [messages, setMessages] = useState<EvidenceMessage[]>([]),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [conversation, setConversation] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/exhibits/source/${item.sourceId}`, {
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Source could not be loaded.");
        const raw = await r.text();
        setMessages(parseEvidenceMessages(raw, mimeType));
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(String(e));
      });
    return () => abort.abort();
  }, [item.sourceId, mimeType]);
  const selected = new Set(item.messageIds ?? messages.map((m) => m.id));
  const visible = messages.filter(
    (m) =>
      (!conversation || m.conversationId === conversation) &&
      `${m.timestamp} ${m.sender} ${m.text}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const control = "rounded border border-white/20 bg-slate-900 p-2 text-sm";
  function choose(ids: string[]) {
    onChange({
      messageIds: ids,
      pages: undefined,
      crop: undefined,
      redactions: undefined,
    });
  }
  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4">
      <h3 className="font-semibold">Exact message selection</h3>
      <p className="text-xs text-slate-300">
        Timestamps and sender names are reproduced from this pinned source.
        Missing attachments must be added separately. Gaps in selected messages
        are marked in the PDF.
      </p>
      {error && <p role="alert">{error}</p>}
      <label className="block text-xs">
        Filter by source date, sender or text
        <input
          className={`${control} w-full`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        Conversation
        <select
          className={`${control} w-full`}
          value={conversation}
          onChange={(e) => setConversation(e.target.value)}
        >
          <option value="">All conversations</option>
          {[...new Set(messages.map((m) => m.conversationId))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className={control}
          disabled={!visible.length}
          onClick={() => choose(visible.map((m) => m.id))}
        >
          Select filtered messages
        </button>
        <button
          className={control}
          onClick={() => choose(messages.map((m) => m.id))}
        >
          Include full context
        </button>
        <button
          className={control}
          disabled={!selected.size}
          onClick={() => {
            const ids = new Set(selected);
            for (const m of messages.filter((m) => selected.has(m.id))) {
              for (
                let i = Math.max(0, m.ordinal - 2);
                i <= Math.min(messages.length - 1, m.ordinal + 2);
                i++
              )
                if (messages[i].conversationId === m.conversationId)
                  ids.add(messages[i].id);
            }
            choose(messages.filter((m) => ids.has(m.id)).map((m) => m.id));
          }}
        >
          Include two messages before/after
        </button>
      </div>
      <p role="status" className="text-sm">
        {selected.size} selected · {visible.length} match filter
      </p>
      <div className="max-h-[500px] space-y-3 overflow-auto">
        {visible.slice(0, 500).map((m) => (
          <label
            key={m.id}
            className="flex gap-3 rounded border border-white/10 p-3"
          >
            <input
              type="checkbox"
              aria-label={`Select source message ${m.ordinal + 1}`}
              checked={selected.has(m.id)}
              onChange={(e) => {
                const ids = new Set(selected);
                if (e.target.checked) ids.add(m.id);
                else ids.delete(m.id);
                choose(messages.filter((m) => ids.has(m.id)).map((m) => m.id));
              }}
            />
            <span className="min-w-0">
              <strong className="block text-sm">
                {m.timestamp} · {m.sender}
              </strong>
              <span className="whitespace-pre-wrap break-words text-sm">
                {m.text}
              </span>
            </span>
          </label>
        ))}
        {visible.length > 500 && (
          <p>
            Showing the first 500 matching messages. Narrow the filter to review
            later messages; bulk selection includes every match.
          </p>
        )}
      </div>
    </section>
  );
}

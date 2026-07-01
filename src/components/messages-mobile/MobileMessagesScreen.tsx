'use client';

import { useMemo, useState } from 'react';
import {
  MobileBottomSheet,
  MobileEmptyState,
  MobileFilterChips,
} from '@/components/mobile-shell';
import type { MobileMessageEvidence } from '@/lib/mobile/caseUtilityData';

type MobileMessagesScreenProps = {
  messages: MobileMessageEvidence[];
};

const filters = ['All', 'Calls', 'Exchange', 'Court', 'Routine'];

/** True when a message evidence item belongs in the selected filter chip. */
function messageMatchesFilter(message: MobileMessageEvidence, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'Calls') return message.category === 'calls';
  if (filter === 'Exchange') return message.category === 'exchange';
  if (filter === 'Court') return message.category === 'court';
  if (filter === 'Routine') return message.category === 'routine';
  return false;
}

/** True when a message evidence item matches the entered search text. */
function messageMatchesSearch(message: MobileMessageEvidence, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  return [
    message.sender,
    message.dateTime,
    message.preview,
    ...message.tags,
  ].some((value) => value.toLowerCase().includes(normalizedSearch));
}

/** Focused message-evidence review screen with search, filters, and detail view. */
export function MobileMessagesScreen({ messages }: MobileMessagesScreenProps) {
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<MobileMessageEvidence | null>(null);

  const filteredMessages = useMemo(
    () => messages.filter(
      (message) => messageMatchesFilter(message, selectedFilter)
        && messageMatchesSearch(message, search),
    ),
    [messages, search, selectedFilter],
  );

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <label htmlFor="mobile-message-search" className="text-xs font-medium text-neutral-500">
            Search messages
          </label>
          <input
            id="mobile-message-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sender, tags, or text"
            className="mt-2 min-h-11 w-full rounded-2xl border border-neutral-300 px-4 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </section>

        <MobileFilterChips
          options={filters}
          selected={selectedFilter}
          onSelect={setSelectedFilter}
          ariaLabel="Message evidence filters"
        />

        {filteredMessages.length > 0 ? (
          <div className="space-y-3">
            {filteredMessages.map((message) => (
              <button
                key={message.id}
                type="button"
                className="block min-h-14 w-full rounded-2xl border border-neutral-200 bg-white p-5 text-left text-neutral-900 shadow-sm active:bg-neutral-50"
                onClick={() => setSelectedMessage(message)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{message.sender}</h2>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      {message.dateTime}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                    {message.linkedFactsCount} facts
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-700">
                  {message.preview}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {message.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <MobileEmptyState
            title="No messages found."
            description="Try a different search or filter to review message evidence."
          />
        )}
      </main>

      <MobileBottomSheet
        isOpen={Boolean(selectedMessage)}
        title={selectedMessage?.sender ?? 'Message detail'}
        description={selectedMessage?.dateTime}
        onClose={() => setSelectedMessage(null)}
      >
        {selectedMessage ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm leading-7 text-neutral-800">{selectedMessage.preview}</p>
            </div>
            <p className="text-xs leading-5 text-neutral-500">
              {selectedMessage.linkedFactsCount} linked facts. Source details should be
              reviewed before using this in a final draft.
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedMessage.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </MobileBottomSheet>
    </>
  );
}

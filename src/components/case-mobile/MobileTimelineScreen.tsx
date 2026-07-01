'use client';

import { useMemo, useState } from 'react';
import { MobileFilterChips } from '@/components/mobile-shell';
import type { MobileTimelineEvent } from '@/lib/mobile/mobileTypes';

type MobileTimelineScreenProps = {
  events: MobileTimelineEvent[];
};

const filters = ['All', 'Messages', 'Court', 'Calls', 'Exchange', 'Evidence'];

function eventMatchesFilter(event: MobileTimelineEvent, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'Messages') return event.category === 'message' || event.sourceType === 'message';
  if (filter === 'Court') return event.category === 'court' || event.sourceType === 'court_note';
  if (filter === 'Calls') return event.category === 'call';
  if (filter === 'Exchange') return event.category === 'exchange';
  if (filter === 'Evidence') return event.category === 'evidence' || event.sourceType === 'document';
  return false;
}

/** Full mobile timeline with horizontal filters and source-backed event cards. */
export function MobileTimelineScreen({ events }: MobileTimelineScreenProps) {
  const [selectedFilter, setSelectedFilter] = useState('All');
  const filteredEvents = useMemo(
    () => events.filter((event) => eventMatchesFilter(event, selectedFilter)),
    [events, selectedFilter],
  );

  return (
    <div className="space-y-4">
      <MobileFilterChips
        options={filters}
        selected={selectedFilter}
        onSelect={setSelectedFilter}
        ariaLabel="Timeline filters"
      />
      <div className="space-y-3">
        {filteredEvents.map((event) => (
          <article key={event.id} className="min-h-14 rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
            <div className="flex items-start gap-3">
              <p className="w-16 shrink-0 text-xs font-medium text-neutral-500">{event.date}</p>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{event.title}</h2>
                {event.description ? (
                  <p className="mt-2 text-sm leading-6 text-neutral-700">{event.description}</p>
                ) : null}
                <p className="mt-3 text-xs text-neutral-500">
                  {event.sourceCount ?? 0} sources linked
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

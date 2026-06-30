import Link from 'next/link';
import type { MobileTimelineEvent } from '@/lib/mobile/mobileTypes';

type MobileTimelineSnapshotProps = {
  caseId: string;
  events: MobileTimelineEvent[];
};

/** Short recent-events timeline snapshot for the mobile workspace. */
export function MobileTimelineSnapshot({ caseId, events }: MobileTimelineSnapshotProps) {
  const visibleEvents = events.slice(0, 5);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Timeline</h2>
        <Link
          href={`/case/${caseId}/timeline`}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-neutral-600 active:bg-neutral-100"
        >
          Expand
        </Link>
      </div>
      {visibleEvents.length > 0 ? (
        <div className="mt-3 space-y-3">
          {visibleEvents.map((event) => (
            <div key={event.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
              <p className="text-xs font-medium text-neutral-500">{event.date}</p>
              <div>
                <p className="truncate text-sm font-medium text-neutral-900">{event.title}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {event.sourceCount ?? 0} sources
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          No timeline events yet. Add an event to start organizing what happened.
        </p>
      )}
    </section>
  );
}


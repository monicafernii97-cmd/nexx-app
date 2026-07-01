import type { MobilePattern } from '@/lib/mobile/mobileTypes';

type MobilePatternsSectionProps = {
  patterns: MobilePattern[];
};

/** Calm source-backed observed pattern section for mobile. */
export function MobilePatternsSection({ patterns }: MobilePatternsSectionProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="text-base font-semibold">Observed Patterns</h2>
      {patterns.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-neutral-800">No patterns detected.</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            We only show patterns when repeated, source-backed behavior is clearly supported.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {patterns.map((pattern) => (
            <article key={pattern.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold leading-6">{pattern.title}</h3>
                <span className="shrink-0 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                  {pattern.supportLabel}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-700">{pattern.summary}</p>
              <div className="mt-3 space-y-2">
                {pattern.supportingEvents.slice(0, 3).map((event, index) => (
                  <p
                    key={event.id ?? `${event.date}-${event.description}-${index}`}
                    className="text-xs leading-5 text-neutral-600"
                  >
                    {event.date} - {event.description}
                  </p>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                {pattern.sourceCount} sources linked
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

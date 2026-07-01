import type { MobileFact } from '@/lib/mobile/mobileTypes';

type MobileFactsListProps = {
  facts: MobileFact[];
};

/** Vertical full-screen list of all mobile key facts. */
export function MobileFactsList({ facts }: MobileFactsListProps) {
  return (
    <div className="space-y-3">
      {facts.map((fact) => (
        <article key={fact.id} className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="text-sm font-semibold">{fact.title}</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-700">{fact.fact}</p>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-neutral-500">
            <span>{fact.sourceCount} sources linked</span>
            {fact.updatedAt ? <span>{fact.updatedAt}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}


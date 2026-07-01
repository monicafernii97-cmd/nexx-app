import Link from 'next/link';
import type { MobileFact } from '@/lib/mobile/mobileTypes';
import { MobileEmptyState } from '@/components/mobile-shell';

type MobileFactsCarouselProps = {
  caseId: string;
  facts: MobileFact[];
};

/** Horizontal snap carousel for the most important mobile key facts. */
export function MobileFactsCarousel({ caseId, facts }: MobileFactsCarouselProps) {
  if (facts.length === 0) {
    return (
      <MobileEmptyState
        title="No key facts yet."
        description="Add messages, notes, or timeline entries to start building your case summary."
        action={
          <Link
            href={`/case/${caseId}/evidence`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-800 active:bg-neutral-100"
          >
            Add Evidence
          </Link>
        }
      />
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-900">Key Facts</h2>
        <Link
          href={`/case/${caseId}/facts`}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-neutral-600 active:bg-neutral-100"
        >
          View All
        </Link>
      </div>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
        <div className="flex snap-x snap-proximity gap-3 pb-1">
          {facts.map((fact) => (
            <article
              key={fact.id}
              className="w-[min(280px,calc(100vw-48px))] shrink-0 snap-start rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-sm"
            >
              <h3 className="text-sm font-semibold">{fact.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-700">
                {fact.fact}
              </p>
              <p className="mt-4 text-xs text-neutral-500">
                {fact.sourceCount} sources linked
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}


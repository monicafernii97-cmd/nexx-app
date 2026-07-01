import Link from 'next/link';

type MobileNarrativePreviewProps = {
  caseId: string;
  previewText: string;
};

/** Case summary preview with mobile-friendly line clamp and fade. */
export function MobileNarrativePreview({ caseId, previewText }: MobileNarrativePreviewProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="text-base font-semibold">Case Summary</h2>
      <div className="relative mt-4 max-h-[8.75rem] overflow-hidden">
        <p className="line-clamp-5 text-sm leading-7 text-neutral-700">{previewText}</p>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-white to-transparent" />
      </div>
      <Link
        href={`/case/${caseId}/workspace/summary`}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-800 active:bg-neutral-100"
      >
        Expand Full Summary
      </Link>
    </section>
  );
}

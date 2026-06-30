type MobileFullSummaryScreenProps = {
  text: string;
};

/** Readable full-screen case summary text for mobile review. */
export function MobileFullSummaryScreen({ text }: MobileFullSummaryScreenProps) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
      <div className="space-y-5">
        {text.split('\n\n').map((paragraph) => (
          <p key={paragraph} className="text-sm leading-7 text-neutral-700">
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}


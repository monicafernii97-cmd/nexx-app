type MobileCaseSnapshotCardProps = {
  title: string;
  factsCount: number;
  eventsCount: number;
  supportedPatternsCount: number;
  lastUpdated: string;
};

/** Compact first-card case snapshot for the mobile workspace. */
export function MobileCaseSnapshotCard({
  title,
  factsCount,
  eventsCount,
  supportedPatternsCount,
  lastUpdated,
}: MobileCaseSnapshotCardProps) {
  const metrics = [
    { label: 'Facts', value: factsCount },
    { label: 'Events', value: eventsCount },
    { label: 'Patterns', value: supportedPatternsCount },
  ];

  return (
    <section className="rounded-[18px] border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
      <p className="text-xs font-medium text-neutral-500">Case Workspace</p>
      <h1 className="mt-1 text-xl font-semibold leading-7">{title}</h1>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl bg-neutral-50 px-3 py-3">
            <p className="text-lg font-semibold leading-none">{metric.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{metric.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-neutral-500">Last updated: {lastUpdated}</p>
    </section>
  );
}


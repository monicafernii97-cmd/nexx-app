'use client';

type MobileSkeletonCardProps = {
  lines?: number;
  className?: string;
};

/** Skeleton card matching the shape of mobile content cards. */
export function MobileSkeletonCard({ lines = 3, className = '' }: MobileSkeletonCardProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-950 ${className}`}
    >
      <div className="h-4 w-1/2 rounded-full bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="h-3 rounded-full bg-neutral-100 dark:bg-neutral-900"
            style={{ width: `${Math.max(52, 92 - index * 14)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';

type MobileEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function MobileEmptyState({ title, description, action }: MobileEmptyStateProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-50">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

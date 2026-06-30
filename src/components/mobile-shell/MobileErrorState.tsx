'use client';

import type { ReactNode } from 'react';

type MobileErrorStateProps = {
  title?: string;
  message?: string;
  action?: ReactNode;
};

export function MobileErrorState({
  title = "We couldn't load this section.",
  message,
  action,
}: MobileErrorStateProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      {message ? <p className="mt-2 text-sm leading-6 text-neutral-600">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}


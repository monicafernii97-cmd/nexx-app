'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { MobileBottomSheet } from '@/components/mobile-shell';
import type { MobileSettingsGroup } from '@/lib/mobile/caseUtilityData';

type MobileSettingsScreenProps = {
  groups: MobileSettingsGroup[];
};

/** Simple grouped case settings screen that keeps configuration out of Workspace. */
export function MobileSettingsScreen({ groups }: MobileSettingsScreenProps) {
  const [selectedRow, setSelectedRow] = useState<{
    label: string;
    description: string;
  } | null>(null);

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4">
        {groups.map((group) => (
          <section key={group.title} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {group.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              {group.rows.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  className={`flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-neutral-100 ${
                    index > 0 ? 'border-t border-neutral-100' : ''
                  }`}
                  onClick={() => setSelectedRow(row)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-900">
                      {row.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500">
                      {row.description}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-400" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      <MobileBottomSheet
        isOpen={Boolean(selectedRow)}
        title={selectedRow?.label ?? 'Setting'}
        description={selectedRow?.description}
        onClose={() => setSelectedRow(null)}
      >
        <p className="text-sm leading-6 text-neutral-700">
          This setting is available here as a mobile-safe detail view. Deeper controls will
          open from this row as the case settings backend is connected.
        </p>
      </MobileBottomSheet>
    </>
  );
}

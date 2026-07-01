'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarPlus, FileUp, MessageSquareText, Plus, StickyNote } from 'lucide-react';
import {
  MobileBottomActionBar,
  MobileBottomSheet,
  MobileEmptyState,
  MobileFilterChips,
  MobilePrimaryActionButton,
} from '@/components/mobile-shell';
import type { MobileEvidenceItem, MobileEvidenceType } from '@/lib/mobile/caseUtilityData';
import { trackMobileEvent } from '@/lib/mobile/mobileAnalytics';

type MobileEvidenceScreenProps = {
  caseId: string;
  evidence: MobileEvidenceItem[];
};

const filters = ['All', 'Messages', 'Photos', 'Documents', 'Court', 'Notes'];

const evidenceTypeLabel: Record<MobileEvidenceType, string> = {
  message: 'Message',
  photo: 'Photo',
  document: 'Document',
  court: 'Court',
  note: 'Note',
};

function evidenceMatchesFilter(item: MobileEvidenceItem, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'Messages') return item.type === 'message';
  if (filter === 'Photos') return item.type === 'photo';
  if (filter === 'Documents') return item.type === 'document';
  if (filter === 'Court') return item.type === 'court';
  if (filter === 'Notes') return item.type === 'note';
  return false;
}

function AddEvidenceOption({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-left active:bg-neutral-100"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-neutral-900">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span>
      </span>
    </button>
  );
}

/** Source-material review screen with filters and an accessible Add Evidence sheet. */
export function MobileEvidenceScreen({ caseId, evidence }: MobileEvidenceScreenProps) {
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const filteredEvidence = useMemo(
    () => evidence.filter((item) => evidenceMatchesFilter(item, selectedFilter)),
    [evidence, selectedFilter],
  );

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <label htmlFor="mobile-evidence-search" className="text-xs font-medium text-neutral-500">
            Search evidence
          </label>
          <input
            id="mobile-evidence-search"
            type="search"
            placeholder="Find documents, notes, or messages"
            className="mt-2 min-h-11 w-full rounded-2xl border border-neutral-300 px-4 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </section>

        <MobileFilterChips
          options={filters}
          selected={selectedFilter}
          onSelect={setSelectedFilter}
          ariaLabel="Evidence filters"
        />

        {filteredEvidence.length > 0 ? (
          <div className="space-y-3">
            {filteredEvidence.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-500">
                      {evidenceTypeLabel[item.type]} - {item.date}
                    </p>
                    <h2 className="mt-2 text-sm font-semibold">{item.title}</h2>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                    {item.linkedFactsCount} facts
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-700">
                  {item.preview}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <MobileEmptyState
            title="No evidence found."
            description="Try another filter or add source material when you are ready."
            action={
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
                onClick={() => setIsAddOpen(true)}
              >
                Add Evidence
              </button>
            }
          />
        )}
      </main>

      <MobileBottomActionBar>
        <MobilePrimaryActionButton
          onClick={() => {
            trackMobileEvent('mobile_add_evidence_tapped', { caseId });
            setIsAddOpen(true);
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add Evidence
          </span>
        </MobilePrimaryActionButton>
      </MobileBottomActionBar>

      <MobileBottomSheet
        isOpen={isAddOpen}
        title="Add Evidence"
        description="Add source material without leaving this case."
        onClose={() => setIsAddOpen(false)}
      >
        <div className="space-y-2">
          <AddEvidenceOption
            icon={<FileUp aria-hidden="true" className="h-5 w-5" />}
            title="Upload File"
            description="Add a document, image, or PDF as source material."
          />
          <AddEvidenceOption
            icon={<StickyNote aria-hidden="true" className="h-5 w-5" />}
            title="Add Note"
            description="Save a short note tied to this case."
          />
          <AddEvidenceOption
            icon={<MessageSquareText aria-hidden="true" className="h-5 w-5" />}
            title="Import Message"
            description="Bring in a message thread for review."
          />
          <AddEvidenceOption
            icon={<CalendarPlus aria-hidden="true" className="h-5 w-5" />}
            title="Add Timeline Event"
            description="Record something that happened on a specific date."
          />
        </div>
      </MobileBottomSheet>
    </>
  );
}

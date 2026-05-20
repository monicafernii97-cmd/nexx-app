'use client';

import { PageContainer } from '@/components/layout/PageLayout';
import ExhibitPacketBuilder from '@/components/pipelines/exhibits/ExhibitPacketBuilder';
import { Suspense } from 'react';
import '@/styles/pipelines.css';

/**
 * Exhibit Builder Page
 * Path: /docuvault/exhibits
 * 
 * Standalone workstation for assembling evidence packets with Bates numbering.
 */
export default function ExhibitBuilderPage() {
  return (
    <PageContainer>
      <Suspense fallback={
        <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <span className="sr-only">Loading Exhibit Hub...</span>
        </div>
      }>
        <div className="py-8">
          <ExhibitPacketBuilder />
        </div>
      </Suspense>
    </PageContainer>
  );
}

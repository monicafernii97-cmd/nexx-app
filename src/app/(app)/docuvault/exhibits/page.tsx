'use client';

import { PageContainer } from '@/components/layout/PageLayout';
import ExhibitPacketBuilder from '@/components/pipelines/exhibits/ExhibitPacketBuilder';
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
      <div className="py-8">
        <ExhibitPacketBuilder />
      </div>
    </PageContainer>
  );
}

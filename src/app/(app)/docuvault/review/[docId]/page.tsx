'use client';

import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageLayout';
import CourtDocumentReviewHub from '@/components/pipelines/court-document/CourtDocumentReviewHub';
import { useWorkspace } from '@/lib/workspace-context';
import '@/styles/pipelines.css';

/**
 * Court Document Review Hub Route
 * Path: /docuvault/review/[docId]
 * 
 * The specialized workstation for section-by-section legal drafting and AI revision.
 */
export default function ReviewHubPage() {
  const params = useParams();
  const docId = params.docId as string;
  const { activeCaseId } = useWorkspace();

  return (
    <PageContainer>
      <div className="py-8">
        <CourtDocumentReviewHub
          docId={docId}
          caseId={activeCaseId ?? undefined}
        />
      </div>
    </PageContainer>
  );
}

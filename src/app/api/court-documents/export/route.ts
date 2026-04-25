/**
 * Court Document Export Route
 *
 * POST /api/court-documents/export
 *
 * Request: { documentId: string }
 *
 * The client sends ONLY the documentId.
 * The server loads all data from Convex, assembles the state,
 * validates preflight, generates the PDF, stores it, and
 * returns a download URL.
 *
 * HARD RULE: Never send full draft state to export routes.
 * Payload limits are a guardrail, not a design constraint.
 */

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { assembleFromConvex } from '@/lib/court-documents/assembleFromConvex';
import { draftStateToLegalDocument } from '@/lib/court-documents/draftStateToLegalDocument';
import { validatePreflight } from '@/lib/court-documents/validatePreflight';
import { generateLegalPDF } from '@/lib/legal-docs/generateLegalPDF';
import { titleCase } from '@/lib/utils/stringHelpers';

/** Force Node.js runtime for Puppeteer PDF rendering. */
export const runtime = 'nodejs';

/** 120s max duration for large document generation. */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  // ── 1. Auth ──
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // ── 2. Parse request (documentId only) ──
  let documentId: string;
  try {
    const body = await request.json();
    documentId = body?.documentId;
    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ error: 'Missing required field: documentId' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  // ── 3. Convex client ──
  let convex;
  try {
    convex = await getAuthenticatedConvexClient();
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate with Convex' }, { status: 401 });
  }

  try {
    // ── 4. Load draft metadata ──
    const draft = await convex.query(api.courtDocumentDrafts.get, { documentId });
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    // ── 5. Load all sections ──
    const sections = await convex.query(api.courtDocumentSections.listByDocument, { documentId });
    if (!sections.length) {
      return NextResponse.json({ error: 'Draft has no sections' }, { status: 400 });
    }

    // ── 6. Load revision history ──
    const revisions = await convex.query(api.courtDocumentRevisions.listByDocument, { documentId });

    // ── 7. Assemble CourtDocumentDraftState in memory ──
    const state = assembleFromConvex({
      draft: {
        documentId: draft.documentId,
        documentType: draft.documentType,
        title: draft.title ?? undefined,
        status: draft.status,
        version: draft.version,
        jurisdictionJson: draft.jurisdictionJson ?? undefined,
        source: draft.source ?? undefined,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
      sections: sections.map(s => ({
        sectionId: s.sectionId,
        heading: s.heading,
        order: s.order,
        content: s.content,
        status: s.status,
        source: s.source,
        required: s.required,
        feedbackNotesJson: s.feedbackNotesJson ?? undefined,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      revisions: revisions.map(r => ({
        sectionId: r.sectionId,
        before: r.before,
        after: r.after,
        diffJson: r.diffJson ?? undefined,
        source: r.source,
        note: r.note ?? undefined,
        createdAt: r.createdAt,
      })),
    });

    console.log(`[CourtDocExport:${requestId}] Assembled state: ${state.sections.length} sections, type=${state.documentType}`);

    // ── 8. Server-side preflight validation ──
    const preflight = validatePreflight(state);
    if (!preflight.canExport) {
      return NextResponse.json({
        error: 'Preflight validation failed — required sections are incomplete',
        blockers: preflight.blockers,
        items: preflight.items.filter(i => i.status === 'missing'),
      }, { status: 422 });
    }

    // ── 9. Convert to LegalDocument ──
    const legalDoc = draftStateToLegalDocument(state);

    // ── 10. Reconstruct rawText for generateLegalPDF() ──
    const rawText = legalDoc.rawText;

    // ── 11. Generate PDF via canonical pipeline ──
    const legalPdf = await generateLegalPDF({
      rawText,
      convexQuery: () => convex.query(api.courtSettings.get, {}),
      documentOverride: {
        jurisdiction: {
          state: state.jurisdiction.state,
          county: state.jurisdiction.county,
        },
      },
    });

    console.log(`[CourtDocExport:${requestId}] PDF generated: ${legalPdf.pdfMeta.byteLength} bytes, sha256=${legalPdf.pdfMeta.sha256.slice(0, 12)}…`);

    // ── 12. Upload PDF to Convex storage ──
    const uploadUrl = await convex.mutation(api.documents.generateUploadUrl, {});
    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 30_000);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(legalPdf.pdfMeta.byteLength),
      },
      body: new Uint8Array(legalPdf.pdfBuffer),
      cache: 'no-store',
      signal: uploadController.signal,
    });

    clearTimeout(uploadTimeout);

    if (!uploadRes.ok) {
      throw new Error(`Storage upload failed (${uploadRes.status})`);
    }

    const uploadResult = await uploadRes.json();
    const storageId = uploadResult?.storageId;
    if (!storageId) {
      throw new Error('Storage upload did not return storageId');
    }

    // ── 13. Create generatedDocuments record ──
    const normalizedState = titleCase(state.jurisdiction.state || '');
    const normalizedCounty = titleCase(state.jurisdiction.county || '');

    const artifact = await convex.mutation(api.quickGenerateArtifacts.createQuickGenArtifact, {
      storageId,
      filename: legalPdf.filename,
      byteSize: legalPdf.pdfMeta.byteLength,
      sha256: legalPdf.pdfMeta.sha256,
      requestId,
      templateId: `review_hub_${state.documentType}`,
      templateTitle: draft.title || legalPdf.parsed.title.main,
      caseType: state.documentType,
      courtState: normalizedState,
      courtCounty: normalizedCounty,
      petitionerName: 'Petitioner',
      respondentName: undefined,
      causeNumber: legalPdf.parsed.metadata.causeNumber,
    });

    // ── 14. Mark draft as exported ──
    await convex.mutation(api.courtDocumentDrafts.updateStatus, {
      documentId,
      status: 'exported',
      completionPct: preflight.completionPct,
    });

    console.log(`[CourtDocExport:${requestId}] Complete: artifactId=${artifact.artifactId}`);

    return NextResponse.json({
      success: true,
      artifactId: artifact.artifactId,
      filename: artifact.filename,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
      downloadUrl: `/api/documents/generate/${artifact.artifactId}/download`,
    });
  } catch (error) {
    console.error(`[CourtDocExport:${requestId}] FAILED:`, error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Export failed',
      code: 'COURT_DOC_EXPORT_FAILED',
    }, { status: 500 });
  }
}

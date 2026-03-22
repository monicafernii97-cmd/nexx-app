import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { getMergedRules } from '@/lib/legal/courtRules';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { escapeHtml } from '@/lib/utils/htmlUtils';
import { getLegalCSS } from '@/lib/legal/pdfHelpers';

export const maxDuration = 60; // Vercel Pro plan: up to 60s for PDF generation

// --- Route Handler ---

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await context.params;
        if (!id) {
            return new NextResponse('Incident ID is required', { status: 400 });
        }

        // Validate ID format before Convex cast (Convex IDs are base32-like alphanumeric strings)
        if (!/^[a-zA-Z0-9_]+$/.test(id)) {
            return new NextResponse('Invalid incident ID format', { status: 400 });
        }

        // Fetch incident from Convex securely
        const convex = await getAuthenticatedConvexClient();
        const incident = await convex.query(api.incidents.get, { id: id as Id<'incidents'> });

        if (!incident) {
            return new NextResponse('Incident not found or access denied', { status: 404 });
        }

        const catLabel = INCIDENT_CATEGORIES.find(c => c.value === incident.category)?.label || incident.category || 'Event';

        // Build Key Point Boxes (if analysis exists, we can dynamically add them, but for now we just show courtSummary properties)
        let keyPointBoxes = '';
        if (incident.severity && incident.severity >= 2) {
            keyPointBoxes += `
                <div class="records-reflect-box">
                  <div class="records-reflect-label">RECORDS REFLECT</div>
                  <div class="key-point-content">Elevated Severity Level (${incident.severity}/3)</div>
                </div>`;
        }

        if (incident.childrenInvolved) {
            keyPointBoxes += `
                <div class="key-point-box">
                  <div class="key-point-label">KEY POINT</div>
                  <div class="key-point-content">Incident involved or occurred in the presence of children.</div>
                </div>`;
        }

        // Generate the HTML for the Incident Report
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Incident Record</title>
  <style>
    ${getLegalCSS()}
    :root {
      --page-width: 8.5in;
      --page-height: 11in;
      --margin-top: 1.0in;
      --margin-bottom: 1.0in;
      --margin-left: 1.0in;
      --margin-right: 1.0in;
      --font-family: Arial, Helvetica, sans-serif;
      --font-size: 12pt;
      --line-spacing: 1.5;
    }
  </style>
</head>
<body>
    <div class="comm-summary">
      <div class="comm-summary-title">INCIDENT RECORD: ${escapeHtml(catLabel.toUpperCase())}</div>
      <div class="comm-summary-subtitle">COMMUNICATION SUMMARY</div>
      <div class="body-paragraph">
        This exhibit contains the formal record and documentation of an incident tracked within the Nexx system occurring on ${escapeHtml(incident.date)}.
      </div>

      <div class="comm-summary-label">The recorded report demonstrates:</div>
      <ol class="comm-summary-points">
        <li>Incident Category: ${escapeHtml(catLabel)}</li>
        <li>Date of Occurrence: ${escapeHtml(incident.date)} at ${escapeHtml(incident.time)}</li>
        <li>Status: ${escapeHtml(incident.status.toUpperCase())}</li>
      </ol>

      <div class="comm-summary-label">COMMUNICATION TIMELINE</div>
      <table class="timeline-table">
        <tr><th>Date & Time</th><th>Description</th></tr>
        <tr>
            <td>${escapeHtml(incident.date)}<br/>${escapeHtml(incident.time)}</td>
            <td>${escapeHtml(incident.courtSummary || incident.narrative)}</td>
        </tr>
      </table>

      ${keyPointBoxes}
    </div>
</body>
</html>`;

        // Generate the PDF using core PDF renderer
        const rules = getMergedRules(undefined, undefined, {});
        const pdfBytes = await renderHTMLToPDF(html, rules);

        const filename = `Incident_Record_${id}.pdf`;
        return new NextResponse(new Uint8Array(pdfBytes), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Content-Length': pdfBytes.length.toString(),
                'Cache-Control': 'private, no-store, max-age=0',
            },
        });
    } catch (error) {
        console.error('[Incident PDF Generation Error]', error);
        return new NextResponse('Error generating PDF', { status: 500 });
    }
}

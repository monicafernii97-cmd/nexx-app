import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { getMergedRules } from '@/lib/legal/courtRules';
import { escapeHtml } from '@/lib/utils/htmlUtils';
import { getLegalCSS } from '@/lib/legal/pdfHelpers';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

export const maxDuration = 60; // Vercel Pro plan: up to 60s for PDF generation

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const convex = await getAuthenticatedConvexClient();
        const incidentsList = await convex.query(api.incidents.list, {});

        if (!incidentsList || incidentsList.length === 0) {
            return new NextResponse('No incidents found', { status: 404 });
        }

        // Sort chronologically ascending
        const sortedIncidents = [...incidentsList].sort((a, b) => {
            const dateA = new Date(a.date).getTime() || 0;
            const dateB = new Date(b.date).getTime() || 0;
            return dateA - dateB;
        });

        // Group by pattern tags for a high-level summary at the top
        const patternsMap = new Map<string, number>();
        sortedIncidents.forEach(incident => {
            if (incident.tags && incident.tags.length > 0) {
                incident.tags.forEach(tag => {
                    patternsMap.set(tag, (patternsMap.get(tag) || 0) + 1);
                });
            }
        });

        let summaryHtml = '';
        if (patternsMap.size > 0) {
            summaryHtml += '<div class="body-paragraph" style="margin-top: 1rem;"><strong>Detected Behavioral Patterns Across Timeline:</strong></div><ul>';
            Array.from(patternsMap.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([tag, count]) => {
                    const label = INCIDENT_CATEGORIES.find(c => c.value === tag)?.label || tag.replace(/_/g, ' ');
                    summaryHtml += `<li>${escapeHtml(label)} (${count} occurrences)</li>`;
                });
            summaryHtml += '</ul>';
        }

        let timelineRows = '';
        sortedIncidents.forEach(incident => {
            const catLabel = INCIDENT_CATEGORIES.find(c => c.value === incident.category)?.label || incident.category || 'Event';
            let tagsHtml = '';
            if (incident.tags && incident.tags.length > 0) {
                const tagLabels = incident.tags.map(t => INCIDENT_CATEGORIES.find(c => c.value === t)?.label || t.replace(/_/g, ' '));
                tagsHtml = `<br/><small style="color: #666;"><strong>Tags:</strong> ${escapeHtml(tagLabels.join(', '))}</small>`;
            }
            
            timelineRows += `
                <tr>
                    <td><strong>${escapeHtml(incident.date)}</strong><br/>${escapeHtml(incident.time)}</td>
                    <td>
                        <strong>${escapeHtml(catLabel)}</strong><br/>
                        ${escapeHtml(incident.courtSummary || incident.narrative)}
                        ${tagsHtml}
                    </td>
                </tr>
            `;
        });

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Incident Timeline Report</title>
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
      --font-size: 11pt;
      --line-spacing: 1.5;
    }
  </style>
</head>
<body>
    <div class="comm-summary">
      <div class="comm-summary-title">COMPREHENSIVE INCIDENT TIMELINE</div>
      <div class="comm-summary-subtitle">CHRONOLOGICAL EVENT LOG</div>
      <div class="body-paragraph">
        This document contains the chronological record of all documented incidents exported from the Nexx platform. 
        It includes ${sortedIncidents.length} recorded events spanning from ${escapeHtml(sortedIncidents[0].date)} to ${escapeHtml(sortedIncidents[sortedIncidents.length - 1].date)}.
      </div>
      
      ${summaryHtml}

      <div class="comm-summary-label" style="margin-top: 2rem;">TIMELINE LOG</div>
      <table class="timeline-table">
        <tr><th style="width: 25%;">Date & Time</th><th>Event Details</th></tr>
        ${timelineRows}
      </table>
    </div>
</body>
</html>`;

        const rules = getMergedRules('', '', {});
        const pdfBytes = await renderHTMLToPDF(html, rules);

        const filename = 'NEXX_Comprehensive_Timeline.pdf';
        return new NextResponse(new Uint8Array(pdfBytes), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    } catch (error) {
        console.error('[Timeline PDF Export Error]', error);
        return new NextResponse('Error generating PDF', { status: 500 });
    }
}

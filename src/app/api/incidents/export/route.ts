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

        let convex;
        try {
            convex = await getAuthenticatedConvexClient();
        } catch (authErr) {
            // Only treat auth-token failures as 401; re-throw config/runtime errors → outer 500
            if (authErr instanceof Error && authErr.message.includes('auth token')) {
                console.error('[Timeline PDF Export] Auth failed:', authErr);
                return new NextResponse('Unauthorized', { status: 401 });
            }
            throw authErr;
        }
        const incidentsList = await convex.query(api.incidents.list, {});

        if (!incidentsList || incidentsList.length === 0) {
            return new NextResponse('No incidents found', { status: 404 });
        }

        // Guard against overly large exports that could cause memory pressure or timeouts
        const MAX_EXPORT_INCIDENTS = 500;
        if (incidentsList.length > MAX_EXPORT_INCIDENTS) {
            return NextResponse.json(
                { error: `Export limited to ${MAX_EXPORT_INCIDENTS} incidents. You have ${incidentsList.length}. Please contact support.` },
                { status: 413 }
            );
        }

        /** Parse a time string (12h or 24h) to minutes since midnight for sorting. */
        const parseTimeToMinutes = (value?: string): number => {
            if (!value) return Number.POSITIVE_INFINITY;
            const normalized = value.trim().toUpperCase();
            const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/);
            if (match12) {
                const h = Number(match12[1]);
                const m = Number(match12[2]);
                if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
                    let hours = h % 12;
                    if (match12[3] === 'PM') hours += 12;
                    return hours * 60 + m;
                }
            }
            const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
            if (match24) {
                const h = Number(match24[1]);
                const m = Number(match24[2]);
                if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
            }
            return Number.POSITIVE_INFINITY;
        };

        // Sort chronologically ascending (date + time)
        const sortedIncidents = [...incidentsList].sort((a, b) => {
            const dateA = new Date(a.date).getTime() || 0;
            const dateB = new Date(b.date).getTime() || 0;
            if (dateA !== dateB) return dateA - dateB;
            const timeA = parseTimeToMinutes(a.time);
            const timeB = parseTimeToMinutes(b.time);
            const aValid = Number.isFinite(timeA);
            const bValid = Number.isFinite(timeB);
            if (aValid && bValid) return timeA - timeB;
            if (aValid) return -1;
            if (bValid) return 1;
            return 0;
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

        // Precompute category labels to avoid repeated linear lookups
        const categoryLabelByValue = new Map<string, string>(
            INCIDENT_CATEGORIES.map(({ value, label }) => [value, label])
        );

        let summaryHtml = '';
        if (patternsMap.size > 0) {
            summaryHtml += '<div class="body-paragraph" style="margin-top: 1rem;"><strong>Detected Behavioral Patterns Across Timeline:</strong></div><ul>';
            Array.from(patternsMap.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([tag, count]) => {
                    const label = categoryLabelByValue.get(tag) || tag.replace(/_/g, ' ');
                    summaryHtml += `<li>${escapeHtml(label)} (${count} occurrences)</li>`;
                });
            summaryHtml += '</ul>';
        }

        let timelineRows = '';
        sortedIncidents.forEach(incident => {
            const catLabel = categoryLabelByValue.get(incident.category ?? '') || incident.category?.replace(/_/g, ' ') || 'Event';
            let tagsHtml = '';
            if (incident.tags && incident.tags.length > 0) {
                const tagLabels = incident.tags.map(t => categoryLabelByValue.get(t) || t.replace(/_/g, ' '));
                tagsHtml = `<br/><small style="color: #666;"><strong>Tags:</strong> ${escapeHtml(tagLabels.join(', '))}</small>`;
            }
            
            timelineRows += `
                <tr>
                    <td><strong>${escapeHtml(incident.date)}</strong><br/>${escapeHtml(incident.time ?? '')}</td>
                    <td>
                        <strong>${escapeHtml(catLabel)}</strong><br/>
                        ${escapeHtml(incident.courtSummary || incident.narrative || '')}
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

        const rules = getMergedRules(undefined, undefined, {});
        const pdfBytes = await renderHTMLToPDF(html, rules);

        const filename = 'NEXX_Comprehensive_Timeline.pdf';
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
        console.error('[Timeline PDF Export Error]', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new NextResponse(`Error generating PDF: ${message}`, { status: 500 });
    }
}

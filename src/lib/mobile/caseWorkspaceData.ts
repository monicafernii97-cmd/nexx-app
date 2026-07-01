import type { MobileFact, MobilePattern, MobileTimelineEvent } from './mobileTypes';

export type MobileCaseWorkspaceData = {
  caseId: string;
  caseName: string;
  lastUpdated: string;
  facts: MobileFact[];
  timeline: MobileTimelineEvent[];
  patterns: MobilePattern[];
  summaryPreview: string;
  fullSummary: string;
};

const sampleFacts: MobileFact[] = [
  {
    id: 'fact-call-conflict',
    title: 'Call schedule conflict',
    fact: 'Midweek calls are repeatedly overlapping with homework and the evening routine.',
    sourceCount: 4,
    updatedAt: 'Today',
  },
  {
    id: 'fact-exchange-logistics',
    title: 'Exchange logistics',
    fact: 'Several exchanges mention last-minute location or timing changes that affected planning.',
    sourceCount: 3,
    updatedAt: 'Yesterday',
  },
  {
    id: 'fact-court-order-review',
    title: 'Court order review',
    fact: 'The uploaded order should be reviewed for specific deadline, possession, and notice language before drafting.',
    sourceCount: 2,
    updatedAt: 'This week',
  },
];

const sampleTimeline: MobileTimelineEvent[] = [
  {
    id: 'event-1',
    date: 'Mar 10',
    title: 'Hearing scheduled',
    description: 'A hearing date was added to the case timeline.',
    sourceType: 'court_note',
    category: 'court',
    sourceCount: 1,
  },
  {
    id: 'event-2',
    date: 'Mar 05',
    title: 'Call conflict during homework',
    description: 'A documented call overlapped with the evening routine.',
    sourceType: 'message',
    category: 'call',
    sourceCount: 2,
  },
  {
    id: 'event-3',
    date: 'Mar 01',
    title: 'Exchange logistics issue',
    description: 'Exchange timing details changed close to the scheduled time.',
    sourceType: 'timeline',
    category: 'exchange',
    sourceCount: 2,
  },
  {
    id: 'event-4',
    date: 'Feb 24',
    title: 'Document uploaded',
    description: 'A court order was added as a source for review.',
    sourceType: 'document',
    category: 'evidence',
    sourceCount: 1,
  },
];

const samplePatterns: MobilePattern[] = [
  {
    id: 'pattern-call-timing',
    title: 'Repeated call timing conflicts',
    supportLabel: 'Supported',
    summary: 'Calls have conflicted with routine across multiple documented dates.',
    sourceCount: 4,
    supportingEvents: [
      {
        date: 'Mar 03',
        description: 'Call overlapped with routine transition time.',
        sourceType: 'message',
        id: 'supporting-event-call-mar-03',
      },
      {
        date: 'Mar 10',
        description: 'Call timing interfered with homework flow.',
        sourceType: 'message',
        id: 'supporting-event-call-mar-10',
      },
    ],
  },
];

const summary =
  'The available workspace records point to a few source-backed issues worth organizing before any court-ready draft is finalized. The most useful next step is to keep the report factual, connect each point to its source, and separate what the documents say from any broader strategy or procedure questions.';

/** Returns mobile workspace data for the route until backend case queries are wired into this shell. */
export function getMobileCaseWorkspaceData(caseId: string): MobileCaseWorkspaceData {
  return {
    caseId,
    caseName: 'Fernandez v. Pugliese',
    lastUpdated: 'Today',
    facts: sampleFacts,
    timeline: sampleTimeline,
    patterns: samplePatterns,
    summaryPreview: summary,
    fullSummary: [
      summary,
      'Key facts should stay short and source-backed. If a fact cannot be tied back to a message, timeline event, document, or note, it should remain out of the report until a source is added.',
      'Observed patterns should stay neutral. Nexproof should describe what the records show, not assign intent or use dramatic labels. This keeps the mobile experience calm and makes the later report easier to review.',
      'Before export, each draft section should be reviewed for accuracy, missing dates, and whether the source notes still support the language being used.',
    ].join('\n\n'),
  };
}

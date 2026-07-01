import type { ReportOutputType } from './reportTypes';

export type MobileEvidenceType =
  | 'message'
  | 'photo'
  | 'document'
  | 'court'
  | 'note';

export type MobileEvidenceItem = {
  id: string;
  title: string;
  type: MobileEvidenceType;
  date: string;
  linkedFactsCount: number;
  preview: string;
};

export type MobileMessageEvidence = {
  id: string;
  sender: string;
  dateTime: string;
  preview: string;
  linkedFactsCount: number;
  tags: string[];
  category: MobileMessageCategory;
};

export type MobileMessageCategory = 'calls' | 'exchange' | 'court' | 'routine';

export type MobileMessageFilter = 'all' | MobileMessageCategory;

export type MobileReportStatus = 'draft' | 'processing' | 'exported' | 'failed';

export type MobileReportItem = {
  id: string;
  title: string;
  createdAt: string;
  type: ReportOutputType;
  status: MobileReportStatus;
};

export type MobileSettingsGroup = {
  title: string;
  rows: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

export type MobileCaseUtilityData = {
  caseId: string;
  caseName: string;
  evidence: MobileEvidenceItem[];
  messages: MobileMessageEvidence[];
  reports: MobileReportItem[];
  settingsGroups: MobileSettingsGroup[];
};

const evidence: MobileEvidenceItem[] = [
  {
    id: 'evidence-final-order',
    title: 'Signed Final Order 2-25-22.pdf',
    type: 'document',
    date: 'Feb 25',
    linkedFactsCount: 3,
    preview: 'Uploaded court order used for deadline, possession, and notice review.',
  },
  {
    id: 'evidence-call-conflict',
    title: 'Homework call thread',
    type: 'message',
    date: 'Mar 05',
    linkedFactsCount: 2,
    preview: 'Messages about a call overlapping with the evening homework routine.',
  },
  {
    id: 'evidence-exchange-note',
    title: 'Exchange location note',
    type: 'note',
    date: 'Mar 01',
    linkedFactsCount: 1,
    preview: 'Short note documenting a late exchange location update.',
  },
  {
    id: 'evidence-hearing',
    title: 'Hearing scheduled',
    type: 'court',
    date: 'Mar 10',
    linkedFactsCount: 1,
    preview: 'Court timeline entry for the next scheduled hearing.',
  },
];

const messages: MobileMessageEvidence[] = [
  {
    id: 'message-1',
    sender: 'Co-parent',
    dateTime: 'Mar 05, 7:18 PM',
    preview: 'I can call later but it may be close to bedtime.',
    linkedFactsCount: 2,
    tags: ['Call', 'Routine'],
    category: 'calls',
  },
  {
    id: 'message-2',
    sender: 'You',
    dateTime: 'Mar 05, 7:21 PM',
    preview: 'Homework is still happening, so please keep the call short tonight.',
    linkedFactsCount: 2,
    tags: ['Call', 'Homework'],
    category: 'routine',
  },
  {
    id: 'message-3',
    sender: 'Co-parent',
    dateTime: 'Mar 01, 4:05 PM',
    preview: 'Can we move the exchange to the other parking lot today?',
    linkedFactsCount: 1,
    tags: ['Exchange'],
    category: 'exchange',
  },
];

const reports: MobileReportItem[] = [
  {
    id: 'draft-summary-current',
    title: 'Current Case Summary Draft',
    createdAt: 'Today',
    type: 'both',
    status: 'draft',
  },
  {
    id: 'report-march-export',
    title: 'March Timeline Export',
    createdAt: 'Mar 12',
    type: 'summary_pdf',
    status: 'exported',
  },
  {
    id: 'report-pattern-retry',
    title: 'Pattern Review Draft',
    createdAt: 'Mar 08',
    type: 'court_document',
    status: 'failed',
  },
];

const settingsGroups: MobileSettingsGroup[] = [
  {
    title: 'Case details',
    rows: [
      {
        id: 'case-name',
        label: 'Case name',
        description: 'Fernandez v. Pugliese',
      },
      {
        id: 'case-type',
        label: 'Case type',
        description: 'Family court workspace',
      },
    ],
  },
  {
    title: 'Notification settings',
    rows: [
      {
        id: 'draft-alerts',
        label: 'Draft updates',
        description: 'Notify when reports finish building.',
      },
      {
        id: 'deadline-alerts',
        label: 'Deadline reminders',
        description: 'Quiet reminders for source-backed dates.',
      },
    ],
  },
  {
    title: 'Connected sources',
    rows: [
      {
        id: 'docuvault',
        label: 'DocuVault',
        description: 'Review uploaded documents and generated drafts.',
      },
      {
        id: 'messages',
        label: 'Messages',
        description: 'Manage imported message evidence.',
      },
    ],
  },
  {
    title: 'Privacy and security',
    rows: [
      {
        id: 'privacy',
        label: 'Source privacy',
        description: 'Sensitive source text is not sent to analytics.',
      },
      {
        id: 'exports',
        label: 'Export preferences',
        description: 'Choose how finished drafts are prepared.',
      },
    ],
  },
];

/** Returns mobile utility screen data until the case backend powers these views. */
export function getMobileCaseUtilityData(caseId: string): MobileCaseUtilityData {
  return {
    caseId,
    caseName: 'Fernandez v. Pugliese',
    evidence,
    messages,
    reports,
    settingsGroups,
  };
}

export type MobileFact = {
  id: string;
  title: string;
  fact: string;
  sourceCount: number;
  updatedAt?: string;
};

export type MobileTimelineEvent = {
  id: string;
  date: string;
  title: string;
  description?: string;
  sourceType: 'message' | 'timeline' | 'pin' | 'court_note' | 'document';
  sourceCount?: number;
};

export type MobilePattern = {
  id: string;
  title: string;
  supportLabel: 'Supported' | 'Clearly Supported';
  summary: string;
  sourceCount: number;
  supportingEvents: Array<{
    id?: string;
    date: string;
    description: string;
    sourceType: string;
  }>;
};

export type MobileScreenStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type MobileRouteSource =
  | 'workspace'
  | 'docuvault'
  | 'facts'
  | 'timeline'
  | 'evidence'
  | 'messages'
  | 'reports'
  | 'settings';


/**
 * CaseGraph — structured case intelligence
 * 
 * The case graph is the persistent, structured representation of everything
 * NEXX knows about a user's case. It is updated after every chat response
 * via persistAfterResponse() and injected into the context prompt (Layer E)
 * every turn.
 * 
 * All 10 top-level keys are defined here per the architecture plan.
 */

// ---------------------------------------------------------------------------
// Root Type
// ---------------------------------------------------------------------------

export interface CaseGraph {
  jurisdiction: CaseJurisdiction;
  parties: CaseParties;
  children: CaseChild[];
  custodyStructure: CustodyStructure;
  currentOrders: CurrentOrder[];
  openIssues: OpenIssue[];
  timeline: CaseTimelineAnchor[];
  evidenceThemes: EvidenceTheme[];
  communicationPatterns: CommunicationPattern[];
  proceduralState: ProceduralState;
}

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface CaseJurisdiction {
  state?: string;
  county?: string;
  courtType?: string;           // e.g. "family", "district"
  caseNumber?: string;
  judgeAssigned?: string;
}

export interface CaseParties {
  userName?: string;
  userRole?: 'petitioner' | 'respondent' | 'intervenor';
  userHasAttorney?: boolean;
  opposingPartyName?: string;
  opposingPartyRole?: string;
  opposingPartyHasAttorney?: boolean;
}

export interface CaseChild {
  initials: string;             // No full names in graph — privacy
  age?: number;
  grade?: string;
  specialNeeds?: string[];
}

export interface CustodyStructure {
  currentType?: 'sole' | 'joint' | 'split' | 'temporary' | 'unknown';
  primaryResidence?: string;
  possessionSchedule?: string;
  supervisedAccess?: boolean;
  modificationPending?: boolean;
}

export interface CurrentOrder {
  orderType: string;            // e.g. "final_order", "temporary_order"
  issuedDate?: string;
  keyProvisions: string[];
  expiresDate?: string;
}

export interface OpenIssue {
  issue: string;                // e.g. "Modify possession schedule"
  userGoal?: string;            // What user is trying to prove/achieve
  status?: 'active' | 'pending' | 'resolved';
  pendingRelief?: string;
}

export interface CaseTimelineAnchor {
  date: string;
  event: string;
  significance?: string;
}

export interface EvidenceTheme {
  theme: string;                // e.g. "communication_obstruction"
  strongPoints: string[];
  weakPoints: string[];
  keyDates?: string[];
}

export interface CommunicationPattern {
  pattern: string;              // e.g. "hostile_texting"
  frequency?: string;
  documentation?: string;       // How it's being documented
}

export interface ProceduralState {
  nextHearing?: string;
  pendingMotions?: string[];
  discoveryStatus?: string;
  filingDeadlines?: string[];
}

// ---------------------------------------------------------------------------
// Empty graph factory
// ---------------------------------------------------------------------------

export function createEmptyCaseGraph(): CaseGraph {
  return {
    jurisdiction: {},
    parties: {},
    children: [],
    custodyStructure: {},
    currentOrders: [],
    openIssues: [],
    timeline: [],
    evidenceThemes: [],
    communicationPatterns: [],
    proceduralState: {},
  };
}

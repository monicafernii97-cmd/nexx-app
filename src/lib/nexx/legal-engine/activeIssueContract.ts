import type { RouteMode } from '../../types';
import { extractSharedLegalTerms } from './legalSignals';

export type ActiveLegalIssueSnapshot = {
  issueKey: string;
  label: string;
  routeMode?: RouteMode;
  userQuestion: string;
  controllingConclusion: string;
  issueTerms: string[];
  sourceAnchors: Array<{ uploadedFileId: string; pageStart?: number; pageEnd?: number }>;
};

const compact = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

export function buildActiveLegalIssueSnapshot(args: {
  userQuestion: string;
  controllingConclusion: string;
  routeMode?: RouteMode;
  uploadedFileIds?: string[];
  pages?: Array<{ uploadedFileId: string; pageStart?: number; pageEnd?: number }>;
}): ActiveLegalIssueSnapshot {
  const combined = `${args.userQuestion}\n${args.controllingConclusion}`;
  const issueTerms = extractSharedLegalTerms(combined).slice(0, 32);
  const isFathersDay = issueTerms.includes("father's day") || issueTerms.includes('fathers day');
  const label = isFathersDay ? "Father's Day possession schedule" : (issueTerms.slice(0, 4).join(' / ') || 'Current legal issue');
  const issueKey = compact(`${args.routeMode ?? 'legal'}:${label}`, 180).toLowerCase();
  const explicitAnchors = args.pages ?? [];
  const sourceAnchors = explicitAnchors.length > 0
    ? explicitAnchors
    : (args.uploadedFileIds ?? []).slice(0, 8).map((uploadedFileId) => ({ uploadedFileId }));
  return {
    issueKey,
    label,
    routeMode: args.routeMode,
    userQuestion: compact(args.userQuestion, 1_500),
    controllingConclusion: compact(args.controllingConclusion, 2_500),
    issueTerms,
    sourceAnchors: sourceAnchors.slice(0, 16),
  };
}

export function summarizeActiveLegalIssue(issue?: ActiveLegalIssueSnapshot | null) {
  if (!issue) return undefined;
  return [
    `Issue: ${issue.label}`,
    `Question: ${issue.userQuestion}`,
    `Verified working conclusion: ${issue.controllingConclusion}`,
    issue.issueTerms.length ? `Key terms: ${issue.issueTerms.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

type GuidancePlaybook = { id: string; patterns: RegExp[]; guidance: string };

const PLAYBOOKS: GuidancePlaybook[] = [
  {
    id: 'obtain-court-record',
    patterns: [/\bsealed\b/i, /\bcourt\s+(?:portal|record|filing)\b/i, /\bdownload\s+(?:the\s+)?(?:order|filing)\b/i],
    guidance: 'If NEXXproof cannot access the court record, explain that boundary plainly. Direct the user to the official court or clerk portal, tell them to obtain the signed PDF rather than a docket preview, then upload it here. Do not invent a portal URL or claim access.',
  },
  {
    id: 'improve-unreadable-scan',
    patterns: [/\b(?:blurry|unreadable|illegible|bad\s+scan|image-only)\b/i],
    guidance: 'Give short scan-recovery steps: export at 300 DPI or higher, keep pages upright and fully visible, use grayscale or color rather than high-contrast thresholding, and upload only the unreadable pages if the saved original remains available.',
  },
  {
    id: 'official-source',
    patterns: [/\b(?:current|official)\s+(?:rule|form|fee|deadline|procedure)\b/i],
    guidance: 'Use a current official judiciary, clerk, legislature, or agency source when web access is available. If it is not available, explain how to locate the official source and ask the user to bring back the link or file; never invent current local procedure.',
  },
];

/** Return only the small outside-NEXXproof playbook relevant to this turn. */
export function guidancePlaybookPrompt(message: string) {
  const match = PLAYBOOKS.find((playbook) => playbook.patterns.some((pattern) => pattern.test(message)));
  return match ? `External guidance playbook (${match.id}): ${match.guidance}` : '';
}

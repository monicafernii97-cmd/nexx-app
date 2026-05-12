export interface ExhibitHubCandidate {
  id: string;
  title: string;
  content?: string;
  label?: string;
  filename?: string;
  source: 'case_memory' | 'case_pin';
}

export interface ExhibitReferenceMention {
  raw: string;
  normalizedLabel?: string;
  index: number;
}

export interface ExhibitReferenceCandidateMatch {
  exhibit: ExhibitHubCandidate;
  score: number;
  reasons: string[];
}

export interface ResolvedExhibitReference {
  mention: ExhibitReferenceMention;
  match: ExhibitReferenceCandidateMatch;
}

export interface AmbiguousExhibitReference {
  mention: ExhibitReferenceMention;
  candidates: ExhibitReferenceCandidateMatch[];
}

export interface ExhibitReferenceMatchResult {
  mentions: ExhibitReferenceMention[];
  confirmed: ResolvedExhibitReference[];
  ambiguous: AmbiguousExhibitReference[];
}

const LABEL_PATTERN = /\b(?:Exhibit|Ex\.?)\s*([A-Z]{1,3}|\d{1,4})\b/gi;

/** Normalize user-entered and stored exhibit text for resilient comparison. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalize stored filenames while ignoring their final extension. */
function normalizeFilename(value: string): string {
  return normalize(value.replace(/\.[a-z0-9]+$/i, ''));
}

/** Extract the canonical label from an exhibit phrase, such as "A" from "Exhibit A". */
function normalizeLabel(value: string): string {
  const match = value.match(/\b(?:exhibit|ex\.?)\s*([a-z]{1,3}|\d{1,4})\b/i);
  return match?.[1]?.toUpperCase() ?? value.trim().toUpperCase();
}

/** Split normalized text into meaningful comparison tokens. */
function normalizedTokens(value: string): Set<string> {
  return new Set(value.split(' ').filter(token => token.length >= 3));
}

/** Split raw text into meaningful comparison tokens. */
function tokens(value: string): Set<string> {
  return normalizedTokens(normalize(value));
}

/** Score token overlap when the first text has already been normalized. */
function tokenOverlapWithNormalized(aNormalized: string, b: string): number {
  const aTokens = normalizedTokens(aNormalized);
  const bTokens = tokens(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(aTokens.size, bTokens.size);
}

/** Infer exhibit labels from every searchable field on an Exhibit Hub candidate. */
function inferCandidateLabels(candidate: ExhibitHubCandidate): Set<string> {
  const labels = new Set<string>();
  if (candidate.label) {
    const normalized = normalizeLabel(candidate.label);
    if (/^(?:[A-Z]{1,3}|\d{1,4})$/.test(normalized)) {
      labels.add(normalized);
    }
  }

  for (const value of [candidate.title, candidate.filename, candidate.content]) {
    if (!value) continue;
    for (const match of value.matchAll(new RegExp(LABEL_PATTERN.source, LABEL_PATTERN.flags))) {
      labels.add((match[1] ?? '').toUpperCase());
    }
  }
  return labels;
}

/** Find explicit exhibit references in pasted document text. */
export function extractExhibitMentions(text: string): ExhibitReferenceMention[] {
  const seen = new Set<string>();
  const mentions: ExhibitReferenceMention[] = [];
  for (const match of text.matchAll(new RegExp(LABEL_PATTERN.source, LABEL_PATTERN.flags))) {
    const raw = match[0].trim();
    const key = `${normalize(raw)}:${match.index ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({
      raw,
      normalizedLabel: normalizeLabel(raw),
      index: match.index ?? 0,
    });
  }
  return mentions;
}

/** Build a stable mention identity from its raw text and source index. */
function mentionKey(raw: string, index: number): string {
  return `${normalize(raw)}:${index}`;
}

/** Add title and filename mentions when users refer to exhibits without "Exhibit X" labels. */
function collectCandidatePhraseMentions(
  text: string,
  candidates: ExhibitHubCandidate[],
  existingMentions: ExhibitReferenceMention[],
): ExhibitReferenceMention[] {
  const normalizedText = normalize(text);
  const seen = new Set(existingMentions.map(mention => mentionKey(mention.raw, mention.index)));
  const seenPhrases = new Set(existingMentions.map(mention => normalize(mention.raw)));
  const mentions: ExhibitReferenceMention[] = [];

  for (const candidate of candidates) {
    const phrases = [
      { raw: candidate.label, normalized: candidate.label ? normalize(candidate.label) : '' },
      { raw: candidate.title, normalized: normalize(candidate.title) },
      { raw: candidate.filename, normalized: candidate.filename ? normalizeFilename(candidate.filename) : '' },
    ];

    for (const phrase of phrases) {
      if (!phrase.raw) continue;
      const normalizedPhrase = phrase.normalized;
      if (normalizedPhrase.length < 6 || !normalizedText.includes(normalizedPhrase)) continue;
      if (seenPhrases.has(normalizedPhrase)) continue;

      const key = mentionKey(phrase.raw, 0);
      if (seen.has(key)) continue;
      seen.add(key);
      seenPhrases.add(normalizedPhrase);
      mentions.push({
        raw: phrase.raw,
        normalizedLabel: normalizeLabel(phrase.raw),
        index: 0,
      });
    }
  }

  return mentions;
}

/** Score a lower-confidence contextual match from the full document text. */
function applyDocumentContextScore(
  normalizedText: string,
  normalizedFilename: string,
  normalizedTitle: string,
  candidate: ExhibitHubCandidate,
  reasons: string[],
): number {
  let score = 0;

  if (normalizedFilename && normalizedText.includes(normalizedFilename)) {
    score += 15;
    reasons.push('filename context');
  }

  if (normalizedTitle && normalizedText.includes(normalizedTitle)) {
    score += 15;
    reasons.push('title context');
  } else {
    const overlap = tokenOverlapWithNormalized(normalizedText, candidate.title);
    if (overlap >= 0.6) {
      score += Math.round(overlap * 20);
      reasons.push('title context words');
    }
  }

  if (candidate.content) {
    const overlap = tokenOverlapWithNormalized(normalizedText, candidate.content);
    if (overlap >= 0.7) {
      score += Math.round(overlap * 10);
      reasons.push('content context words');
    }
  }

  return score;
}

/** Score one exhibit candidate against one detected mention and the surrounding document text. */
function scoreCandidate(
  normalizedText: string,
  mention: ExhibitReferenceMention,
  candidate: ExhibitHubCandidate,
): ExhibitReferenceCandidateMatch | null {
  const reasons: string[] = [];
  let score = 0;
  const normalizedMention = normalize(mention.raw);
  const candidateLabels = inferCandidateLabels(candidate);
  const hasExplicitLabelMention = /\b(?:exhibit|ex\.?)\s*([a-z]{1,3}|\d{1,4})\b/i.test(mention.raw);

  if (hasExplicitLabelMention && mention.normalizedLabel && !candidateLabels.has(mention.normalizedLabel)) {
    return null;
  }

  if (mention.normalizedLabel && candidateLabels.has(mention.normalizedLabel)) {
    score += 100;
    reasons.push(`label ${mention.normalizedLabel}`);
  }

  const normalizedTitle = normalize(candidate.title);
  const normalizedFilename = candidate.filename ? normalizeFilename(candidate.filename) : '';

  if (normalizedFilename && normalizedMention.includes(normalizedFilename)) {
    score += 90;
    reasons.push('filename');
  }

  if (normalizedTitle && normalizedMention.includes(normalizedTitle)) {
    score += 85;
    reasons.push('title');
  } else {
    const overlap = tokenOverlapWithNormalized(normalizedMention, candidate.title);
    if (overlap >= 0.6) {
      score += Math.round(overlap * 60);
      reasons.push('title words');
    }
  }

  if (candidate.content) {
    const overlap = tokenOverlapWithNormalized(normalizedMention, candidate.content);
    if (overlap >= 0.7) {
      score += Math.round(overlap * 30);
      reasons.push('content words');
    }
  }

  score += applyDocumentContextScore(
    normalizedText,
    normalizedFilename,
    normalizedTitle,
    candidate,
    reasons,
  );

  return score > 0 ? { exhibit: candidate, score, reasons } : null;
}

/** Match pasted exhibit references to existing Exhibit Hub candidates, flagging unclear cases. */
export function matchExhibitReferences(
  text: string,
  candidates: ExhibitHubCandidate[],
): ExhibitReferenceMatchResult {
  const normalizedText = normalize(text);
  const labelMentions = extractExhibitMentions(text);
  const mentions = [
    ...labelMentions,
    ...collectCandidatePhraseMentions(text, candidates, labelMentions),
  ];
  const confirmed: ResolvedExhibitReference[] = [];
  const ambiguous: AmbiguousExhibitReference[] = [];

  for (const mention of mentions) {
    const ranked = candidates
      .map(candidate => scoreCandidate(normalizedText, mention, candidate))
      .filter((match): match is ExhibitReferenceCandidateMatch => Boolean(match))
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      if (candidates.length > 0) {
        ambiguous.push({
          mention,
          candidates: candidates.slice(0, 5).map(exhibit => ({
            exhibit,
            score: 0,
            reasons: ['needs confirmation'],
          })),
        });
      }
      continue;
    }

    const [top, second] = ranked;
    if (top.score >= 80 && (!second || top.score - second.score >= 20)) {
      confirmed.push({ mention, match: top });
    } else {
      ambiguous.push({ mention, candidates: ranked.slice(0, 5) });
    }
  }

  return { mentions, confirmed, ambiguous };
}

export interface IncidentVoiceDraftInput {
  transcript: string;
  date?: string;
  time?: string;
  location?: string;
  witnesses?: string;
  courtSummary?: string;
  behavioralAnalysis?: string;
  strategicResponse?: string;
}

export interface IncidentVoiceDraft {
  title: string;
  summary: string;
  peopleInvolved: string[];
  eventDate: string;
  whyItMatters: string;
  timelineTitle: string;
  timelineDescription: string;
}

const MAX_TITLE_LENGTH = 80;
const MAX_SUMMARY_LENGTH = 700;

/** Collapse whitespace so dictated text can be safely reused in titles and summaries. */
export function normalizeIncidentVoiceText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Return the first sentence-like span from dictated text. */
export function firstIncidentSentence(text: string) {
  const normalized = normalizeIncidentVoiceText(text);
  return normalized.match(/^.+?[.!?](?:\s|$)/)?.[0].trim() || normalized;
}

/** Trim long generated labels without cutting in the middle of a word when possible. */
export function trimIncidentLabel(text: string, maxLength = MAX_TITLE_LENGTH) {
  const normalized = normalizeIncidentVoiceText(text);
  if (normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, lastSpace > 24 ? lastSpace : maxLength).trim()}...`;
}

/** Extract a conservative people list from witness text plus obvious capitalized name phrases. */
export function extractIncidentPeople(transcript: string, witnesses?: string) {
  const people = new Set<string>();
  witnesses
    ?.split(',')
    .map((name) => normalizeIncidentVoiceText(name))
    .filter(Boolean)
    .forEach((name) => people.add(name));

  const nameMatches = transcript.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) ?? [];
  nameMatches
    .filter((name) => !/^(The|This|That|When|Then|After|Before|During|On|At|I|We|He|She|They|It)$/.test(name))
    .slice(0, 8)
    .forEach((name) => people.add(name));

  return [...people].slice(0, 10);
}

/** Build editable structured incident fields from a dictated transcript and optional analysis. */
export function deriveIncidentVoiceDraft(input: IncidentVoiceDraftInput): IncidentVoiceDraft {
  const transcript = normalizeIncidentVoiceText(input.transcript);
  const firstSentence = firstIncidentSentence(transcript);
  const title = trimIncidentLabel(firstSentence || 'Dictated incident');
  const summarySource = input.courtSummary || transcript;
  const summary = trimIncidentLabel(summarySource, MAX_SUMMARY_LENGTH);
  const whySource = input.behavioralAnalysis || input.strategicResponse || '';
  const whyItMatters = firstIncidentSentence(whySource) || 'Potentially relevant to documenting chronology, context, and case patterns.';
  const eventDate = input.date || '';
  const timeSuffix = input.time ? ` at ${input.time}` : '';
  const locationSuffix = input.location ? ` Location: ${input.location}.` : '';

  return {
    title,
    summary,
    peopleInvolved: extractIncidentPeople(transcript, input.witnesses),
    eventDate,
    whyItMatters,
    timelineTitle: title,
    timelineDescription: `${summary}${eventDate ? `\n\nDate: ${eventDate}${timeSuffix}.` : ''}${locationSuffix}`,
  };
}

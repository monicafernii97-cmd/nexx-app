import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';

export type CourtFilingExtraction = {
  documentType:
    | 'petition'
    | 'motion'
    | 'enforcement'
    | 'modification'
    | 'temporary_orders'
    | 'protective_order'
    | 'notice_of_hearing'
    | 'order'
    | 'unknown';
  filedBy: string | null;
  filedAgainst: string | null;
  reliefRequested: string[];
  allegations: Array<{
    allegation: string;
    sourceIds: string[];
    pageStart?: number | null;
    pageEnd?: number | null;
  }>;
  deadlinesOrHearings: Array<{
    type: 'hearing' | 'response_deadline' | 'service_deadline' | 'other';
    dateOrTime: string;
    sourceIds: string[];
    pageStart?: number | null;
    pageEnd?: number | null;
  }>;
  requestedOrders: string[];
  serviceClues: string[];
  currentOrderReferences: string[];
  missingInfoNeeded: string[];
};

const DATE_PHRASE =
  String.raw`(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})`;
const MAX_PACKET_TEXT_CHARS = 20_000;
const MAX_COMBINED_TEXT_CHARS = 80_000;

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function capPacket(packet: LegalDocumentSourcePacket): LegalDocumentSourcePacket {
  return {
    ...packet,
    text: packet.text.slice(0, MAX_PACKET_TEXT_CHARS),
  };
}

function unique(values: string[], maxItems = 8) {
  return Array.from(new Set(values.map(normalize).filter(Boolean))).slice(0, maxItems);
}

function snippetAround(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match) return null;
  const start = Math.max(0, match.index - 90);
  const end = Math.min(text.length, match.index + match[0].length + 140);
  return normalize(text.slice(start, end));
}

function inferDocumentType(text: string): CourtFilingExtraction['documentType'] {
  if (/\bprotective\s+order|restraining\s+order\b/i.test(text)) return 'protective_order';
  if (/\btemporary\s+orders?\b/i.test(text)) return 'temporary_orders';
  if (/\bmotion\s+to\s+enforce|petition\s+for\s+enforcement|enforcement\b/i.test(text)) return 'enforcement';
  if (/\bmodify|modification|petition\s+to\s+modify|motion\s+to\s+modify\b/i.test(text)) return 'modification';
  if (/\bpetition\b/i.test(text)) return 'petition';
  if (/\bmotion\b/i.test(text)) return 'motion';
  if (/\bnotice\s+of\s+hearing\b/i.test(text)) return 'notice_of_hearing';
  if (/\border\b/i.test(text) && !/\bpetition|motion\b/i.test(text)) return 'order';
  return 'unknown';
}

function captureParty(text: string, label: RegExp) {
  const match = text.match(label);
  return match?.[1] ? normalize(match[1]).slice(0, 120) : null;
}

function extractRelief(text: string) {
  const relief: string[] = [];
  const prayer = text.match(/\b(?:prayer|request(?:s|ed)?|relief requested|asks? the court)\b[:\s-]*([\s\S]{0,900})/i)?.[1];
  if (prayer) {
    const sentences = prayer
      .split(/(?:\n|\.|;)/)
      .map(normalize)
      .filter((line) => /\b(request|ask|order|award|grant|modify|enforce|contempt|possession|support|attorney'?s fees?)\b/i.test(line));
    relief.push(...sentences);
  }
  const targeted = text.match(/\b(?:requests?|asks?)\s+(?:that\s+)?(?:the\s+)?court\s+(?:to\s+)?([^.;\n]{10,220})/gi) ?? [];
  relief.push(...targeted.map((item) => item.replace(/\b(?:requests?|asks?)\s+(?:that\s+)?(?:the\s+)?court\s+(?:to\s+)?/i, '')));
  return unique(relief, 10);
}

function extractRequestedOrders(text: string) {
  const matches = text.match(/\b(?:order(?:ed)?|orders?|grant(?:ed)?|award(?:ed)?|modify|enforce)\b[^.;\n]{12,220}/gi) ?? [];
  return unique(matches, 10);
}

function extractSourceBackedItems(
  packets: LegalDocumentSourcePacket[],
  pattern: RegExp,
  maxItems = 6
): CourtFilingExtraction['allegations'] {
  const items: CourtFilingExtraction['allegations'] = [];
  for (const packet of packets) {
    const snippet = snippetAround(packet.text, pattern);
    if (!snippet) continue;
    items.push({
      allegation: snippet,
      sourceIds: [packet.sourceId],
      pageStart: packet.pageStart ?? null,
      pageEnd: packet.pageEnd ?? null,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

function extractDeadlinesOrHearings(packets: LegalDocumentSourcePacket[]): CourtFilingExtraction['deadlinesOrHearings'] {
  const items: CourtFilingExtraction['deadlinesOrHearings'] = [];
  const hearingPattern = new RegExp(String.raw`\b(?:hearing|court date|trial)\b[^.\n]{0,120}\b(${DATE_PHRASE}|at\s+\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?))`, 'i');
  const responsePattern = new RegExp(String.raw`\b(?:response|answer|filed|serve)\b[^.\n]{0,120}\b(?:due|deadline|no later than|within)\b[^.\n]{0,120}`, 'i');
  const servicePattern = /\b(?:served|service of process|certificate of service|return of service)\b[^.\n]{0,180}/i;

  for (const packet of packets) {
    const checks: Array<[CourtFilingExtraction['deadlinesOrHearings'][number]['type'], RegExp]> = [
      ['hearing', hearingPattern],
      ['response_deadline', responsePattern],
      ['service_deadline', servicePattern],
    ];
    for (const [type, pattern] of checks) {
      const snippet = snippetAround(packet.text, pattern);
      if (!snippet) continue;
      items.push({
        type,
        dateOrTime: snippet,
        sourceIds: [packet.sourceId],
        pageStart: packet.pageStart ?? null,
        pageEnd: packet.pageEnd ?? null,
      });
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.dateOrTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export function extractCourtFilingFromSources(
  sourcePackets: LegalDocumentSourcePacket[]
): CourtFilingExtraction | null {
  if (sourcePackets.length === 0) return null;

  const cappedPackets = sourcePackets.map(capPacket);
  const combinedText = normalize(cappedPackets.map((packet) => packet.text).join('\n\n').slice(0, MAX_COMBINED_TEXT_CHARS));
  const documentType = inferDocumentType(combinedText);
  const hasFilingSignal = documentType !== 'unknown' ||
    /\b(relief requested|prayer|petitioner|respondent|movant|motion|petition|hearing|served|asks the court)\b/i.test(combinedText);
  if (!hasFilingSignal) return null;

  const allegations = extractSourceBackedItems(
    cappedPackets,
    /\b(?:allege[sd]?|claims?|contends?|failed to|refused to|violat(?:ed|ing|ion)|withheld|denied|interfered|arrears|contempt)\b/i,
    8
  );
  const deadlinesOrHearings = extractDeadlinesOrHearings(cappedPackets);
  const serviceClues = unique(cappedPackets.flatMap((packet) => {
    const snippet = snippetAround(packet.text, /\b(?:served|service of process|certificate of service|return of service)\b/i);
    return snippet ? [snippet] : [];
  }), 6);
  const currentOrderReferences = unique(cappedPackets.flatMap((packet) => {
    const snippet = snippetAround(packet.text, /\b(?:prior order|current order|final order|temporary order|possession order|parenting plan|order signed)\b/i);
    return snippet ? [snippet] : [];
  }), 6);

  return {
    documentType,
    filedBy: captureParty(combinedText, /\b(?:filed by|petitioner|movant)\s*:?\s*([A-Z][^.;\n]{2,100})/i),
    filedAgainst: captureParty(combinedText, /\b(?:filed against|respondent|responding party)\s*:?\s*([A-Z][^.;\n]{2,100})/i),
    reliefRequested: extractRelief(combinedText),
    allegations,
    deadlinesOrHearings,
    requestedOrders: extractRequestedOrders(combinedText),
    serviceClues,
    currentOrderReferences,
    missingInfoNeeded: unique([
      serviceClues.length === 0 ? 'service date' : '',
      deadlinesOrHearings.some((item) => item.type === 'hearing') ? '' : 'hearing date or notice of hearing',
      currentOrderReferences.length === 0 ? 'current controlling order' : '',
      documentType === 'unknown' ? 'filing type' : '',
    ]),
  };
}

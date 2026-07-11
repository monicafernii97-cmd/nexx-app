import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { ClaimSourceRef } from './groundedClaims';

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
  partyFacts: SourceBackedFilingClaim[];
  reliefRequested: string[];
  reliefRequestedClaims: SourceBackedFilingClaim[];
  reliefRequestedFacts: SourcedCourtFact[];
  allegations: Array<{
    allegation: string;
    sourceIds: string[];
    pageStart?: number | null;
    pageEnd?: number | null;
  }>;
  deadlinesOrHearings: Array<{
    type: 'hearing' | 'response_deadline' | 'service_claim' | 'other';
    dateOrTime: string;
    sourceIds: string[];
    pageStart?: number | null;
    pageEnd?: number | null;
    supportingExcerpt?: string;
    fileId?: string;
    fileName?: string;
    verificationStatus?: 'verified' | 'reported' | 'unresolved';
  }>;
  requestedOrders: string[];
  requestedOrderClaims: SourceBackedFilingClaim[];
  requestedOrderFacts: SourcedCourtFact[];
  serviceClues: string[];
  serviceClueClaims: SourceBackedFilingClaim[];
  serviceClaimedInDocument: boolean;
  claimedServiceDate: string | null;
  claimedServiceMethod: string | null;
  userConfirmedReceiptDate: string | null;
  userConfirmedService: boolean | null;
  serviceValidityVerified: boolean;
  currentOrderReferences: string[];
  currentOrderReferenceClaims: SourceBackedFilingClaim[];
  sourcedFacts: SourcedCourtFact[];
  missingInfoNeeded: string[];
};

export type SourceBackedFilingClaim = {
  text: string;
  sourceIds: string[];
  pageStart?: number | null;
  pageEnd?: number | null;
  supportingExcerpt: string;
  fileId?: string;
  fileName?: string;
  sourceRefs?: ClaimSourceRef[];
  verificationStatus?: 'verified' | 'reported' | 'unresolved';
};

export type SourcedCourtFact = {
  text: string;
  factType:
    | 'document_type'
    | 'relief_requested'
    | 'allegation'
    | 'hearing'
    | 'service'
    | 'deadline'
    | 'requested_order'
    | 'party_identity'
    | 'order_reference';
  sourceIds: string[];
  pageStart?: number | null;
  pageEnd?: number | null;
  supportingExcerpt?: string;
  fileId?: string;
  fileName?: string;
  verificationStatus?: 'verified' | 'reported' | 'unresolved';
};

export type ExtractedCourtDocument = {
  fileId: string;
  fileName: string;
  role: CourtDocumentRole;
  documentRole:
    | 'current_filing'
    | 'controlling_order'
    | 'notice'
    | 'prior_filing'
    | 'exhibit'
    | 'unknown';
  extraction: CourtFilingExtraction;
};

export type CourtDocumentRole =
  | 'initiating_filing'
  | 'responsive_filing'
  | 'notice'
  | 'controlling_order'
  | 'proposed_order'
  | 'exhibit'
  | 'message_evidence'
  | 'unknown';

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

function uniqueFacts(values: SourcedCourtFact[], maxItems = 8) {
  const seen = new Set<string>();
  const facts: SourcedCourtFact[] = [];
  for (const value of values) {
    const text = normalize(value.text);
    if (!text) continue;
    const key = `${value.factType}:${text.toLowerCase()}:${value.sourceIds.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ ...value, text });
    if (facts.length >= maxItems) break;
  }
  return facts;
}

function uniqueClaims(values: SourceBackedFilingClaim[], maxItems = 8) {
  const seen = new Set<string>();
  const claims: SourceBackedFilingClaim[] = [];
  for (const value of values) {
    const text = normalize(value.text);
    if (!text || value.sourceIds.length === 0 || !value.supportingExcerpt.trim()) continue;
    const key = `${text.toLowerCase()}:${value.sourceIds.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({
      ...value,
      text,
      supportingExcerpt: normalize(value.supportingExcerpt),
      verificationStatus: value.verificationStatus ?? 'verified',
    });
    if (claims.length >= maxItems) break;
  }
  return claims;
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

function capturePartyClaim(packets: LegalDocumentSourcePacket[], label: RegExp) {
  for (const packet of packets) {
    const match = packet.text.match(label);
    if (!match?.[1]) continue;
    return claimFromPacket(packet, normalize(match[1]).slice(0, 120), match[0]);
  }
  return null;
}

function extractPartyClaims(packets: LegalDocumentSourcePacket[]) {
  return uniqueClaims([
    capturePartyClaim(packets, /\b(?:filed by|petitioner|movant)\s*:?\s*([A-Z][^.;\n]{2,100})/i),
    capturePartyClaim(packets, /\b(?:filed against|respondent|responding party)\s*:?\s*([A-Z][^.;\n]{2,100})/i),
  ].filter((claim): claim is SourceBackedFilingClaim => Boolean(claim)), 4);
}

function extractCurrentOrderReferenceClaims(packets: LegalDocumentSourcePacket[]) {
  return uniqueClaims(packets.flatMap((packet) => {
    const snippet = snippetAround(packet.text, /\b(?:prior order|current order|final order|temporary order|possession order|parenting plan|order signed)\b/i);
    return snippet ? [claimFromPacket(packet, snippet, snippet)] : [];
  }), 6);
}

function factFromPacket(
  packet: LegalDocumentSourcePacket,
  factType: SourcedCourtFact['factType'],
  text: string,
  supportingExcerpt?: string
): SourcedCourtFact {
  return {
    text,
    factType,
    sourceIds: [packet.sourceId],
    pageStart: packet.pageStart ?? null,
    pageEnd: packet.pageEnd ?? null,
    supportingExcerpt: supportingExcerpt ?? text,
    fileId: packet.fileId,
    fileName: packet.fileName,
    verificationStatus: 'verified',
  };
}

function claimFromPacket(
  packet: LegalDocumentSourcePacket,
  text: string,
  supportingExcerpt?: string
): SourceBackedFilingClaim {
  return {
    text,
    sourceIds: [packet.sourceId],
    pageStart: packet.pageStart ?? null,
    pageEnd: packet.pageEnd ?? null,
    supportingExcerpt: supportingExcerpt ?? text,
    fileId: packet.fileId,
    fileName: packet.fileName,
    sourceRefs: [{
      sourceId: packet.sourceId,
      fileId: packet.fileId,
      fileName: packet.fileName,
      pageStart: packet.pageStart ?? null,
      pageEnd: packet.pageEnd ?? null,
    }],
    verificationStatus: 'verified',
  };
}

function claimFromFact(fact: SourcedCourtFact): SourceBackedFilingClaim {
  return {
    text: fact.text,
    sourceIds: fact.sourceIds,
    pageStart: fact.pageStart ?? null,
    pageEnd: fact.pageEnd ?? null,
    supportingExcerpt: fact.supportingExcerpt ?? fact.text,
    fileId: fact.fileId,
    fileName: fact.fileName,
    sourceRefs: fact.sourceIds.map((sourceId) => ({
      sourceId,
      fileId: fact.fileId,
      fileName: fact.fileName,
      pageStart: fact.pageStart ?? null,
      pageEnd: fact.pageEnd ?? null,
    })),
    verificationStatus: fact.verificationStatus ?? 'verified',
  };
}

function extractReliefFacts(packets: LegalDocumentSourcePacket[]) {
  const relief: SourcedCourtFact[] = [];
  for (const packet of packets) {
    const text = packet.text;
    const prayer = text.match(/\b(?:prayer|request(?:s|ed)?|relief requested|asks? the court)\b[:\s-]*([\s\S]{0,900})/i)?.[1];
    if (prayer) {
      const sentences = prayer
        .split(/(?:\n|\.|;)/)
        .map(normalize)
        .filter((line) => /\b(request|ask|order|award|grant|modify|enforce|contempt|possession|support|attorney'?s fees?)\b/i.test(line));
      relief.push(...sentences.map((line) => factFromPacket(packet, 'relief_requested', line, prayer)));
    }
    const targeted = text.match(/\b(?:requests?|asks?)\s+(?:that\s+)?(?:the\s+)?court\s+(?:to\s+)?([^.;\n]{10,220})/gi) ?? [];
    relief.push(...targeted.map((item) => factFromPacket(
      packet,
      'relief_requested',
      item.replace(/\b(?:requests?|asks?)\s+(?:that\s+)?(?:the\s+)?court\s+(?:to\s+)?/i, ''),
      item
    )));
  }

  return uniqueFacts(relief, 10);
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

function extractRequestedOrderFacts(packets: LegalDocumentSourcePacket[]) {
  const facts: SourcedCourtFact[] = [];
  for (const packet of packets) {
    const matches = packet.text.match(/\b(?:order(?:ed)?|orders?|grant(?:ed)?|award(?:ed)?|modify|enforce)\b[^.;\n]{12,220}/gi) ?? [];
    facts.push(...matches.map((match) => factFromPacket(packet, 'requested_order', match, match)));
  }
  return uniqueFacts(facts, 10);
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
      ['service_claim', servicePattern],
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
        supportingExcerpt: snippet,
        fileId: packet.fileId,
        fileName: packet.fileName,
        verificationStatus: type === 'service_claim' ? 'reported' : 'verified',
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

function extractServiceDetails(packets: LegalDocumentSourcePacket[]) {
  const serviceClaims = packets.flatMap((packet) => {
    const snippet = snippetAround(packet.text, /\b(?:served|service of process|certificate of service|return of service)\b/i);
    return snippet ? [claimFromPacket(packet, snippet, snippet)] : [];
  });
  const serviceClueClaims = uniqueClaims(serviceClaims, 6);
  const serviceSnippets = serviceClueClaims.map((claim) => claim.text);
  const joined = serviceSnippets.join(' ');
  const claimedServiceDate =
    joined.match(new RegExp(String.raw`\b(?:served|service|certificate of service|return of service)\b[^.\n]{0,120}\b(${DATE_PHRASE})`, 'i'))?.[1] ??
    null;
  const claimedServiceMethod =
    joined.match(/\b(?:by|via)\s+(email|e-?service|mail|certified mail|personal service|hand delivery|constable|sheriff|process server)\b/i)?.[1] ??
    null;

  return {
    serviceClues: unique(serviceSnippets, 6),
    serviceClueClaims,
    serviceClaimedInDocument: serviceSnippets.length > 0,
    claimedServiceDate: claimedServiceDate ? normalize(claimedServiceDate) : null,
    claimedServiceMethod: claimedServiceMethod ? normalize(claimedServiceMethod) : null,
  };
}

function extractionFromSingleDocument(
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
  const serviceDetails = extractServiceDetails(cappedPackets);
  const currentOrderReferenceClaims = extractCurrentOrderReferenceClaims(cappedPackets);
  const currentOrderReferences = currentOrderReferenceClaims.map((claim) => claim.text);
  const reliefRequestedFacts = extractReliefFacts(cappedPackets);
  const reliefRequestedClaims = uniqueClaims(reliefRequestedFacts.map(claimFromFact), 10);
  const requestedOrderFacts = extractRequestedOrderFacts(cappedPackets);
  const requestedOrderClaims = uniqueClaims(requestedOrderFacts.map(claimFromFact), 10);
  const partyFacts = extractPartyClaims(cappedPackets);
  const hearingFacts: SourcedCourtFact[] = deadlinesOrHearings
    .filter((item) => item.type === 'hearing')
    .map((item) => ({
      text: item.dateOrTime,
      factType: 'hearing',
      sourceIds: item.sourceIds,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      supportingExcerpt: item.supportingExcerpt ?? item.dateOrTime,
      fileId: item.fileId,
      fileName: item.fileName,
      verificationStatus: 'verified',
    }));
  const deadlineFacts: SourcedCourtFact[] = deadlinesOrHearings
    .filter((item) => item.type === 'response_deadline')
    .map((item) => ({
      text: item.dateOrTime,
      factType: 'deadline',
      sourceIds: item.sourceIds,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      supportingExcerpt: item.supportingExcerpt ?? item.dateOrTime,
      fileId: item.fileId,
      fileName: item.fileName,
      verificationStatus: 'verified',
    }));
  const serviceFacts: SourcedCourtFact[] = deadlinesOrHearings
    .filter((item) => item.type === 'service_claim')
    .map((item) => ({
      text: item.dateOrTime,
      factType: 'service',
      sourceIds: item.sourceIds,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      supportingExcerpt: item.dateOrTime,
      fileId: item.fileId,
      fileName: item.fileName,
      verificationStatus: 'reported',
    }));
  const allegationFacts: SourcedCourtFact[] = allegations.map((item) => ({
    text: item.allegation,
    factType: 'allegation',
    sourceIds: item.sourceIds,
    pageStart: item.pageStart,
    pageEnd: item.pageEnd,
  }));
  const documentTypeFact: SourcedCourtFact[] = documentType === 'unknown' ? [] : [{
    text: documentType.replace(/_/g, ' '),
    factType: 'document_type',
    sourceIds: cappedPackets[0] ? [cappedPackets[0].sourceId] : [],
    pageStart: cappedPackets[0]?.pageStart ?? null,
    pageEnd: cappedPackets[0]?.pageEnd ?? null,
    supportingExcerpt: cappedPackets[0]?.text.slice(0, 300) ?? documentType.replace(/_/g, ' '),
    fileId: cappedPackets[0]?.fileId,
    fileName: cappedPackets[0]?.fileName,
    verificationStatus: 'verified',
  }];
  const partySourcedFacts: SourcedCourtFact[] = partyFacts.map((claim) => ({
    text: claim.text,
    factType: 'party_identity',
    sourceIds: claim.sourceIds,
    pageStart: claim.pageStart,
    pageEnd: claim.pageEnd,
    supportingExcerpt: claim.supportingExcerpt,
    fileId: claim.fileId,
    fileName: claim.fileName,
    verificationStatus: 'verified',
  }));
  const currentOrderReferenceFacts: SourcedCourtFact[] = currentOrderReferenceClaims.map((claim) => ({
    text: claim.text,
    factType: 'order_reference',
    sourceIds: claim.sourceIds,
    pageStart: claim.pageStart,
    pageEnd: claim.pageEnd,
    supportingExcerpt: claim.supportingExcerpt,
    fileId: claim.fileId,
    fileName: claim.fileName,
    verificationStatus: 'verified',
  }));

  return {
    documentType,
    filedBy: captureParty(combinedText, /\b(?:filed by|petitioner|movant)\s*:?\s*([A-Z][^.;\n]{2,100})/i),
    filedAgainst: captureParty(combinedText, /\b(?:filed against|respondent|responding party)\s*:?\s*([A-Z][^.;\n]{2,100})/i),
    partyFacts,
    reliefRequested: reliefRequestedFacts.length
      ? reliefRequestedFacts.map((fact) => fact.text)
      : extractRelief(combinedText),
    reliefRequestedClaims,
    reliefRequestedFacts,
    allegations,
    deadlinesOrHearings,
    requestedOrders: requestedOrderFacts.length
      ? requestedOrderFacts.map((fact) => fact.text)
      : extractRequestedOrders(combinedText),
    requestedOrderClaims,
    requestedOrderFacts,
    serviceClues: serviceDetails.serviceClues,
    serviceClueClaims: serviceDetails.serviceClueClaims,
    serviceClaimedInDocument: serviceDetails.serviceClaimedInDocument,
    claimedServiceDate: serviceDetails.claimedServiceDate,
    claimedServiceMethod: serviceDetails.claimedServiceMethod,
    userConfirmedReceiptDate: null,
    userConfirmedService: null,
    serviceValidityVerified: false,
    currentOrderReferences,
    currentOrderReferenceClaims,
    sourcedFacts: uniqueFacts([
      ...documentTypeFact,
      ...partySourcedFacts,
      ...reliefRequestedFacts,
      ...requestedOrderFacts,
      ...allegationFacts,
      ...hearingFacts,
      ...deadlineFacts,
      ...serviceFacts,
      ...currentOrderReferenceFacts,
    ], 40),
    missingInfoNeeded: unique([
      'when you actually received the filing and how you received it',
      deadlinesOrHearings.some((item) => item.type === 'hearing') ? '' : 'hearing date or notice of hearing',
      currentOrderReferences.length === 0 ? 'current controlling order' : '',
      documentType === 'unknown' ? 'filing type' : '',
    ]),
  };
}

function groupPacketsByFile(sourcePackets: LegalDocumentSourcePacket[]) {
  const grouped = new Map<string, LegalDocumentSourcePacket[]>();
  for (const packet of sourcePackets) {
    const key = packet.fileId || packet.fileName || packet.sourceId;
    grouped.set(key, [...(grouped.get(key) ?? []), packet]);
  }
  return grouped;
}

function inferDocumentRole(
  extraction: CourtFilingExtraction,
  packets: LegalDocumentSourcePacket[]
): ExtractedCourtDocument['documentRole'] {
  const fileText = normalize(`${packets[0]?.fileName ?? ''} ${packets.map((packet) => packet.sectionHeading ?? '').join(' ')} ${packets.slice(0, 3).map((packet) => packet.text).join(' ')}`);
  if (extraction.documentType === 'notice_of_hearing') return 'notice';
  if (extraction.documentType === 'order') return 'controlling_order';
  if (/\b(final|temporary|amended|signed|current)\s+order\b/i.test(fileText) && !/\bpetition|motion\b/i.test(fileText)) {
    return 'controlling_order';
  }
  if (['petition', 'motion', 'enforcement', 'modification', 'temporary_orders', 'protective_order'].includes(extraction.documentType)) {
    return 'current_filing';
  }
  if (/\bexhibit|attachment\b/i.test(fileText)) return 'exhibit';
  return 'unknown';
}

function toCourtDocumentRole(
  legacyRole: ExtractedCourtDocument['documentRole'],
  extraction: CourtFilingExtraction,
  packets: LegalDocumentSourcePacket[]
): CourtDocumentRole {
  const fileText = normalize(`${packets[0]?.fileName ?? ''} ${packets.slice(0, 2).map((packet) => packet.text).join(' ')}`);
  if (legacyRole === 'notice') return 'notice';
  if (legacyRole === 'controlling_order') {
    return /\b(?:proposed|unsigned|draft)\b/i.test(fileText) ? 'proposed_order' : 'controlling_order';
  }
  if (legacyRole === 'exhibit') return 'exhibit';
  if (legacyRole === 'current_filing' || legacyRole === 'prior_filing') {
    if (/\b(response|answer|opposition)\b/i.test(fileText)) return 'responsive_filing';
    return ['petition', 'motion', 'enforcement', 'modification', 'temporary_orders', 'protective_order'].includes(extraction.documentType)
      ? 'initiating_filing'
      : 'unknown';
  }
  if (/\b(text message|email thread|appclose|ourfamilywizard)\b/i.test(fileText)) return 'message_evidence';
  return 'unknown';
}

export function extractCourtDocumentsFromSources(
  sourcePackets: LegalDocumentSourcePacket[]
): ExtractedCourtDocument[] {
  const documents: ExtractedCourtDocument[] = [];
  for (const [fileId, packets] of groupPacketsByFile(sourcePackets)) {
    const extraction = extractionFromSingleDocument(packets);
    if (!extraction) continue;
    const documentRole = inferDocumentRole(extraction, packets);
    documents.push({
      fileId,
      fileName: packets[0]?.fileName ?? 'Unknown document',
      role: toCourtDocumentRole(documentRole, extraction, packets),
      documentRole,
      extraction,
    });
  }
  return documents;
}

function documentSelectionScore(document: ExtractedCourtDocument) {
  const roleScore: Record<ExtractedCourtDocument['documentRole'], number> = {
    current_filing: 100,
    notice: 65,
    prior_filing: 45,
    controlling_order: 10,
    exhibit: 5,
    unknown: 0,
  };
  const filingTypeScore = document.extraction.documentType !== 'unknown' ? 20 : 0;
  const reliefScore = document.extraction.reliefRequested.length > 0 ? 12 : 0;
  const hearingScore = document.extraction.deadlinesOrHearings.some((item) => item.type === 'hearing') ? 8 : 0;
  return roleScore[document.documentRole] + filingTypeScore + reliefScore + hearingScore;
}

export function selectActiveCourtFiling(
  documents: ExtractedCourtDocument[]
): ExtractedCourtDocument | null {
  const candidates = documents
    .filter((document) => document.documentRole !== 'controlling_order' && document.documentRole !== 'exhibit')
    .sort((a, b) => documentSelectionScore(b) - documentSelectionScore(a));
  return candidates[0] ?? null;
}

export function extractCourtFilingFromSources(
  sourcePackets: LegalDocumentSourcePacket[]
): CourtFilingExtraction | null {
  return selectActiveCourtFiling(extractCourtDocumentsFromSources(sourcePackets))?.extraction ?? null;
}

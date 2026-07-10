import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';

export type OrderAuthorityStatus = {
  status:
    | 'signed_and_entered'
    | 'signed_not_confirmed_entered'
    | 'temporary_active'
    | 'temporary_expired'
    | 'proposed_unsigned'
    | 'superseded'
    | 'unknown';
  signedDate: string | null;
  filedDate: string | null;
  supersededBy: string | null;
  enforceabilityConfirmed: boolean;
  sourceIds: string[];
};

const DATE_PHRASE = String.raw`(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})`;

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function sourcesMatching(packets: LegalDocumentSourcePacket[], pattern: RegExp) {
  return unique(packets.filter((packet) => pattern.test(packet.text)).map((packet) => packet.sourceId));
}

export function resolveOrderAuthorityStatus(sourcePackets: LegalDocumentSourcePacket[]): OrderAuthorityStatus {
  const unknownStatus = (): OrderAuthorityStatus => ({
    status: 'unknown',
    signedDate: null,
    filedDate: null,
    supersededBy: null,
    enforceabilityConfirmed: false,
    sourceIds: [],
  });
  if (sourcePackets.length === 0) return unknownStatus();

  const combined = sourcePackets.map((packet) => packet.text).join('\n');
  const lower = combined.toLowerCase();
  const proposedSources = sourcesMatching(sourcePackets, /\b(proposed order|unsigned|draft order)\b/i);
  const supersededSources = sourcesMatching(sourcePackets, /\b(superseded|replaced by|amended order|modified by)\b/i);
  const temporarySources = sourcesMatching(sourcePackets, /\btemporary orders?\b/i);
  const signedSources = sourcesMatching(sourcePackets, /\b(signed|judge|entered|ordered|decreed)\b/i);
  const filedSources = sourcesMatching(sourcePackets, /\b(file stamp|filed|entered)\b/i);
  const expiredSources = sourcesMatching(sourcePackets, /\b(expired|expires|until further order|temporary orders? terminated)\b/i);
  const signedDate = firstMatch(combined, [
    new RegExp(String.raw`\bsigned\s+(?:on\s+)?(${DATE_PHRASE})`, 'i'),
    new RegExp(String.raw`\bdate\s+signed\s*:?\s*(${DATE_PHRASE})`, 'i'),
  ]) ?? null;
  const filedDate = firstMatch(combined, [
    new RegExp(String.raw`\bfiled\s+(?:on\s+)?(${DATE_PHRASE})`, 'i'),
    new RegExp(String.raw`\bentered\s+(?:on\s+)?(${DATE_PHRASE})`, 'i'),
  ]) ?? null;
  const supersededBy = firstMatch(combined, [
    /\bsuperseded\s+by\s+([^.\n]{3,120})/i,
    /\breplaced\s+by\s+([^.\n]{3,120})/i,
    /\bmodified\s+by\s+([^.\n]{3,120})/i,
  ]) ?? null;

  if (supersededSources.length > 0) {
    return {
      status: 'superseded',
      signedDate,
      filedDate,
      supersededBy,
      enforceabilityConfirmed: false,
      sourceIds: supersededSources,
    };
  }

  if (proposedSources.length > 0 && signedSources.length === 0) {
    return {
      status: 'proposed_unsigned',
      signedDate,
      filedDate,
      supersededBy,
      enforceabilityConfirmed: false,
      sourceIds: proposedSources,
    };
  }

  if (temporarySources.length > 0) {
    const expired = expiredSources.length > 0 && /\b(expired|terminated)\b/i.test(lower);
    return {
      status: expired ? 'temporary_expired' : 'temporary_active',
      signedDate,
      filedDate,
      supersededBy,
      enforceabilityConfirmed: !expired && signedSources.length > 0,
      sourceIds: unique([...temporarySources, ...signedSources, ...filedSources]),
    };
  }

  if (signedSources.length > 0 && filedSources.length > 0) {
    return {
      status: 'signed_and_entered',
      signedDate,
      filedDate,
      supersededBy,
      enforceabilityConfirmed: true,
      sourceIds: unique([...signedSources, ...filedSources]),
    };
  }

  if (signedSources.length > 0) {
    return {
      status: 'signed_not_confirmed_entered',
      signedDate,
      filedDate,
      supersededBy,
      enforceabilityConfirmed: false,
      sourceIds: signedSources,
    };
  }

  return unknownStatus();
}

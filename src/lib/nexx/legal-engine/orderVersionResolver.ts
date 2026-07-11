import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import { resolveOrderAuthorityStatus, type OrderAuthorityStatus } from './orderStatusResolver';

export type ResolvedOrderVersion = {
  activeOrderFileId: string | null;
  activeOrderFileName: string | null;
  authorityStatus: OrderAuthorityStatus;
  candidateCount: number;
  needsUserSelection: boolean;
};

function groupByFile(sourcePackets: LegalDocumentSourcePacket[]) {
  const groups = new Map<string, LegalDocumentSourcePacket[]>();
  for (const packet of sourcePackets) {
    const key = packet.fileId || packet.fileName || packet.sourceId;
    groups.set(key, [...(groups.get(key) ?? []), packet]);
  }
  return Array.from(groups.values());
}

function statusRank(status: OrderAuthorityStatus['status']) {
  switch (status) {
    case 'signed_and_entered':
      return 7;
    case 'temporary_active':
      return 6;
    case 'signed_not_confirmed_entered':
      return 5;
    case 'unknown':
      return 3;
    case 'temporary_expired':
      return 2;
    case 'proposed_unsigned':
      return 1;
    case 'superseded':
      return 0;
  }
}

export function resolveOrderVersion(sourcePackets: LegalDocumentSourcePacket[]): ResolvedOrderVersion {
  const orderGroups = groupByFile(sourcePackets).filter((packets) =>
    packets.some((packet) => /\border|decree|parenting plan|possession schedule\b/i.test(packet.text))
  );
  if (orderGroups.length === 0) {
    return {
      activeOrderFileId: null,
      activeOrderFileName: null,
      authorityStatus: {
        status: 'unknown',
        signedDate: null,
        filedDate: null,
        supersededBy: null,
        enforceabilityConfirmed: false,
        sourceIds: [],
      },
      candidateCount: 0,
      needsUserSelection: false,
    };
  }

  const ranked = orderGroups
    .map((packets) => ({
      packets,
      status: resolveOrderAuthorityStatus(packets),
    }))
    .sort((a, b) => statusRank(b.status.status) - statusRank(a.status.status));
  const top = ranked[0];
  const tied = ranked.filter((item) => statusRank(item.status.status) === statusRank(top.status.status));

  return {
    activeOrderFileId: top.packets[0]?.fileId ?? null,
    activeOrderFileName: top.packets[0]?.fileName ?? null,
    authorityStatus: top.status,
    candidateCount: orderGroups.length,
    needsUserSelection: tied.length > 1 && top.status.status !== 'signed_and_entered',
  };
}

import type { PackedCaseIntake } from './packedCaseIntake';

export type EvidenceTimelineItem = {
  dateOrRelativeTime: string;
  event: string;
  evidenceAvailable: string[];
  courtRelevance: string;
  neutralDescription: string;
};

export function buildEvidenceTimeline(intake: PackedCaseIntake): EvidenceTimelineItem[] {
  if (intake.factualTimeline.length === 0) {
    return [{
      dateOrRelativeTime: 'date needed',
      event: 'Key event needs to be placed in date order.',
      evidenceAvailable: intake.coParentCommunication.messagesMentioned ? ['message thread'] : [],
      courtRelevance: 'Helps the judge see sequence, compliance, and disputed facts.',
      neutralDescription: 'On [date], [event happened]. I responded by [action]. Evidence: [record].',
    }];
  }

  return intake.factualTimeline.map((item) => ({
    dateOrRelativeTime: item.dateOrRelativeTime,
    event: item.event,
    evidenceAvailable: item.evidenceMentioned.length > 0 ? item.evidenceMentioned : ['supporting proof to identify'],
    courtRelevance: item.legalRelevance,
    neutralDescription: `On ${item.dateOrRelativeTime}, ${item.event.replace(/\s+/g, ' ').trim()}.`,
  }));
}

import type { LegalDocumentSourcePacket } from '../../legalDocumentAnswer';

const packet = (
  sourceId: string,
  page: number,
  text: string,
  sectionHeading?: string
): LegalDocumentSourcePacket => ({
  sourceId,
  fileId: 'final-order-46-pages',
  fileName: 'Final Order.pdf',
  chunkId: sourceId,
  blockIds: [sourceId],
  pageStart: page,
  pageEnd: page,
  sectionHeading,
  text,
});

export const fathersDayJuneteenth46PagePackets: LegalDocumentSourcePacket[] = [
  packet(
    'summer_page_12',
    3,
    "-- 12 of 46 -- The designated summer period shall not interfere with Father's Day possession.",
    'Extended summer possession'
  ),
  packet(
    'general_page_15',
    4,
    '-- 15 of 46 -- Except as otherwise expressly provided in this Modified Expanded Possession Order, if a federal, state, or local holiday falls on Friday during summer, that weekend period of possession begins Thursday at 6:00 p.m.',
    'Weekend extensions'
  ),
  packet(
    'father_page_16',
    5,
    "-- 16 of 46 -- Father's Day. Giovanni shall have possession each year, beginning at 6:00 p.m. on the Friday preceding Father's Day and ending at 8:00 a.m. on the Monday after Father's Day.",
    "Father's Day"
  ),
  packet(
    'thanksgiving_page_17',
    5,
    '-- 17 of 46 -- Thanksgiving in Odd-Numbered Years begins when school is dismissed. Christmas possession ends at noon on December 28.',
    'Thanksgiving and Christmas'
  ),
];

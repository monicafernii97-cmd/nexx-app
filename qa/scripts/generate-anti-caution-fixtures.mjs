import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'qa', 'fixtures', 'anti-caution');
mkdirSync(outDir, { recursive: true });

function esc(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function contentStream(lines) {
  const body = [
    'BT',
    '/F1 12 Tf',
    '72 742 Td',
    '16 TL',
    ...lines.flatMap((line) => [
      `(${esc(line)}) Tj`,
      'T*',
    ]),
    'ET',
  ].join('\n');
  return `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
}

function makePdf(pages) {
  const objects = [];
  const add = (value) => {
    objects.push(value);
    return objects.length;
  };

  const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = add('');
  const pageIds = [];
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (const pageLines of pages) {
    const contentId = add(contentStream(pageLines));
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  if (catalogId !== 1) throw new Error('Unexpected catalog object id');

  const parts = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(parts.join(''), 'latin1'));
    parts.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(parts.join(''), 'latin1');
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push('0000000000 65535 f \n');
  for (let index = 1; index < offsets.length; index += 1) {
    parts.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(parts.join(''), 'latin1');
}

const commonPages = {
  page1: [
    'CAUSE NO. QA-2026-001',
    'IN THE 999TH DISTRICT COURT',
    'SAMPLE COUNTY, TEXAS',
    'IN THE INTEREST OF AVERY SAMPLE, A CHILD',
    'SYNTHETIC QA ORDER - NOT A REAL COURT RECORD',
  ],
  page2: [
    'DEFINITIONS',
    'This synthetic order is for NEXX anti-caution QA only.',
    'The parties are Riley Sample and Jordan Example.',
  ],
  page3: [
    'GENERAL WEEKEND EXTENSION',
    'Except as otherwise expressly provided in this order, if a federal,',
    'state, or local holiday falls on a Friday during the summer months,',
    'a regular weekend period of possession begins Thursday at 6:00 p.m.',
  ],
  page4: [
    'UNRELATED PROPERTY SECTION',
    'This page intentionally has no possession schedule language.',
    'Household property and account references are omitted from the QA scenario.',
  ],
  page5Clear: [
    "FATHER'S DAY",
    "The father shall have possession beginning at 6:00 p.m. on the Friday",
    "preceding Father's Day and ending at 8:00 a.m. on the Monday following",
    "Father's Day.",
  ],
  page6: [
    'SIGNATURES',
    'SIGNED on June 1, 2026.',
    'Judge Fictional Example',
  ],
};

const fixtures = {
  'clear-order.pdf': [
    commonPages.page1,
    commonPages.page2,
    commonPages.page3,
    commonPages.page4,
    commonPages.page5Clear,
    commonPages.page6,
  ],
  'partial-relevant-readable.pdf': [
    commonPages.page1,
    commonPages.page2,
    commonPages.page3,
    commonPages.page4,
    [
      "FATHER'S DAY",
      "The father shall have possession beginn_ng at 6:00 p.m. on the Friday",
      "preceding Father's Day and ending at 8:00 a.m. on the Monday following",
      "Father's Day.",
      'Mild visual noise is represented by missing characters, but key terms remain readable.',
    ],
    commonPages.page6,
  ],
  'irrelevant-page-unreadable.pdf': [
    commonPages.page1,
    commonPages.page2,
    commonPages.page3,
    [
      'UNRELATED PROPERTY SECTION',
      '######### ######### #########',
      'This unrelated page is intentionally visually degraded for QA.',
      'It has no possession schedule language.',
    ],
    commonPages.page5Clear,
    commonPages.page6,
  ],
  'controlling-language-unreadable.pdf': [
    commonPages.page1,
    commonPages.page2,
    commonPages.page3,
    commonPages.page4,
    [
      "FATHER'S DAY",
      'The father shall have possession [start-time phrase unreadable]',
      "and ending at 8:00 a.m. on the Monday following Father's Day.",
      'The heading and ending time remain readable, but the start-time phrase is obscured.',
    ],
    commonPages.page6,
  ],
  'no-fathers-day-clause.pdf': [
    commonPages.page1,
    commonPages.page2,
    commonPages.page3,
    commonPages.page4,
    [
      'OTHER HOLIDAY POSSESSION',
      "This synthetic order intentionally contains no separate Father's Day",
      'possession provision on this page or elsewhere.',
    ],
    commonPages.page6,
  ],
};

for (const [filename, pages] of Object.entries(fixtures)) {
  writeFileSync(join(outDir, filename), makePdf(pages));
}

writeFileSync(
  join(outDir, 'README.md'),
  [
    '# Anti-Caution QA Fixtures',
    '',
    'Synthetic PDFs for the NEXX direct-answer and internal-detail suppression matrix.',
    'These documents use fictional names, fictional cause numbers, and no real client data.',
    '',
    '- `clear-order.pdf`: pages 3 and 5 are fully readable.',
    '- `partial-relevant-readable.pdf`: page 5 has mild missing characters but key terms remain readable.',
    '- `irrelevant-page-unreadable.pdf`: unrelated page 4 is degraded while pages 3 and 5 remain readable.',
    '- `controlling-language-unreadable.pdf`: page 5 start-time phrase is obscured.',
    "- `no-fathers-day-clause.pdf`: no separate Father's Day provision is present.",
    '',
  ].join('\n')
);

console.log(`Generated ${Object.keys(fixtures).length} anti-caution fixtures in ${outDir}`);

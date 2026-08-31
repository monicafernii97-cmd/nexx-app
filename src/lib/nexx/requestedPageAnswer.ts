import type { DocumentReferenceDetection } from './documentReferenceDetection';

export type RequestedPageEvidence = {
  filename: string;
  pageNumber: number;
  text: string;
};

const MAX_EXACT_PAGE_COUNT = 10;
const MAX_EXACT_PAGE_CHARACTERS = 60_000;

/** Render exact named pages directly from canonical page records after provider reasoning. */
export function renderExactRequestedPages(args: {
  detection: DocumentReferenceDetection;
  pages: RequestedPageEvidence[];
}) {
  if (!args.detection.requiresExactText || args.pages.length === 0) return null;

  const uniquePages = Array.from(new Map(
    args.pages.map((page) => [`${page.filename}:${page.pageNumber}`, {
      ...page,
      text: page.text.trim(),
    }])
  ).values()).filter((page) => page.text);
  if (uniquePages.length === 0 || uniquePages.length > MAX_EXACT_PAGE_COUNT) return null;
  if (uniquePages.reduce((total, page) => total + page.text.length, 0) > MAX_EXACT_PAGE_CHARACTERS) {
    return null;
  }

  return uniquePages
    .sort((a, b) => a.pageNumber - b.pageNumber || a.filename.localeCompare(b.filename))
    .map((page) => [
      `**${page.filename} — page ${page.pageNumber}**`,
      '',
      page.text
        .split(/\r?\n/)
        .map((line) => `> ${line || ' '}`)
        .join('\n'),
    ].join('\n'))
    .join('\n\n');
}

export const KNOWN_MARKDOWN_HEADING_PATTERN =
  /^(\*\*(?:Court posture|Co-parent response|Document this neutrally|Pro se \/ attorney strategy|Cost and resources|Judge-ready explanation|Filing plan)\*\*|Next steps:|Neutral draft:|Firmer version:|You can say:|The first priority is this:)/i;

export function markdownHeadingKey(line: string) {
  return line.match(KNOWN_MARKDOWN_HEADING_PATTERN)?.[1]?.toLowerCase() ?? null;
}

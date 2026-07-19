export type FathersDayScheduleTerms = {
  startTime: string;
  endTime: string;
};

function normalizedTime(value: string) {
  const compact = value.toLowerCase().replace(/[.\s]/g, '');
  const match = compact.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ?? '00';
  if (hour < 1 || hour > 12 || Number(minute) > 59) return null;
  return `${hour}:${minute} ${match[3]}`;
}

function timeAtBoundary(value: string, boundary: 'start' | 'end') {
  const patterns = boundary === 'start'
    ? [
      /(?:begin(?:ning|s)?|start(?:ing|s)?)[^.!?]{0,40}?(\d{1,2}(?::\d{2})?\s*[ap](?:\.?\s*m\.?)?)[^.!?]{0,40}?\bfriday\b/i,
      /(?:begin(?:ning|s)?|start(?:ing|s)?)[^.!?]{0,40}?\bfriday\b[^.!?]{0,40}?(\d{1,2}(?::\d{2})?\s*[ap](?:\.?\s*m\.?)?)/i,
      /\bfriday\b[^.!?]{0,24}?(\d{1,2}(?::\d{2})?\s*[ap](?:\.?\s*m\.?)?)/i,
    ]
    : [
      /(?:end(?:ing|s)?)[^.!?]{0,40}?(\d{1,2}(?::\d{2})?\s*[ap](?:\.?\s*m\.?)?)[^.!?]{0,40}?\bmonday\b/i,
      /(?:end(?:ing|s)?)[^.!?]{0,40}?\bmonday\b[^.!?]{0,40}?(\d{1,2}(?::\d{2})?\s*[ap](?:\.?\s*m\.?)?)/i,
      /\bmonday\b[^.!?]{0,24}?(\d{1,2}(?::\d{2})?\s*[ap](?:\.?\s*m\.?)?)/i,
    ];
  for (const pattern of patterns) {
    const candidate = pattern.exec(value)?.[1];
    if (candidate) return normalizedTime(candidate);
  }
  return null;
}

export function containsFathersDayTerm(value: string) {
  return /\bfather'?s day\b/i.test(value.replace(/[’‘]/g, "'"));
}

export function extractFathersDayScheduleTerms(value: string): FathersDayScheduleTerms | null {
  const text = value.replace(/[’‘]/g, "'");
  if (!containsFathersDayTerm(text) || !/\bfriday\b/i.test(text) || !/\bmonday\b/i.test(text)) return null;
  const startTime = timeAtBoundary(text, 'start');
  const endTime = timeAtBoundary(text, 'end');
  return startTime && endTime ? { startTime, endTime } : null;
}

export function textMatchesFathersDaySchedule(value: string, expected: FathersDayScheduleTerms) {
  const actual = extractFathersDayScheduleTerms(value);
  return Boolean(actual && actual.startTime === expected.startTime && actual.endTime === expected.endTime);
}

export function displayScheduleTime(value: string) {
  const [clock, meridiem] = value.split(' ');
  return `${clock} ${meridiem[0]}.m.`;
}

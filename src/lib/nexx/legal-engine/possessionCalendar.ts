export type PossessionCalendarResolution = {
  year: number;
  holidayName: string;
  holidayDate: string;
  startDate: string;
  endDate: string;
};

export type RequestedPossessionSchedule = PossessionCalendarResolution & {
  startLabel: string;
  endLabel: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function fathersDayForYear(year: number) {
  const juneFirst = new Date(Date.UTC(year, 5, 1));
  const firstSundayOffset = (7 - juneFirst.getUTCDay()) % 7;
  return new Date(Date.UTC(year, 5, 1 + firstSundayOffset + 14));
}

export function resolveFathersDayPossession(year: number): PossessionCalendarResolution {
  const holiday = fathersDayForYear(year);
  const start = new Date(holiday);
  start.setUTCDate(holiday.getUTCDate() - 2);
  const end = new Date(holiday);
  end.setUTCDate(holiday.getUTCDate() + 1);
  return {
    year,
    holidayName: "Father's Day",
    holidayDate: isoDate(holiday),
    startDate: isoDate(start),
    endDate: isoDate(end),
  };
}

export function isJuneteenth(date: Date) {
  return date.getUTCMonth() === 5 && date.getUTCDate() === 19;
}

export function resolveRequestedFathersDaySchedule(args: {
  userMessage: string;
  controllingText: string;
  currentYear?: number;
  timeZone?: string;
}): RequestedPossessionSchedule | null {
  if (!/father'?s day/i.test(args.userMessage)) return null;
  const explicitYear = args.userMessage.match(/\b(20\d{2})\b/)?.[1];
  if (!explicitYear && !/\bthis year\b/i.test(args.userMessage)) return null;
  if (!/friday preceding father'?s day/i.test(args.controllingText) ||
      !/monday (?:after|following) father'?s day/i.test(args.controllingText)) return null;
  const startTime = args.controllingText.match(/(?:beginning|begins|start(?:ing|s)?)\s+at\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s+on\s+the\s+friday/i)?.[1];
  const endTime = args.controllingText.match(/(?:ending|ends)\s+at\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s+on\s+the\s+monday/i)?.[1];
  if (!startTime || !endTime) return null;
  const year = explicitYear ? Number(explicitYear) : args.currentYear ?? new Date().getUTCFullYear();
  const calendar = resolveFathersDayPossession(year);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: args.timeZone ?? 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const formatDate = (iso: string) => formatter.format(new Date(`${iso}T12:00:00Z`));
  return {
    ...calendar,
    startLabel: `${formatDate(calendar.startDate)} at ${startTime.trim()}`,
    endLabel: `${formatDate(calendar.endDate)} at ${endTime.trim()}`,
  };
}

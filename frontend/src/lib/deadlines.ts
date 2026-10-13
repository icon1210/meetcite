/**
 * Turns deadlines as people say them ("by Wednesday", "tomorrow", "next week", "14 October")
 * into dates, counted from the day of the meeting. Vague deadlines ("ASAP", "soon") return null:
 * MeetCite never guesses a date that was not stated.
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

export function parseDeadline(text: string | null | undefined, meetingDate: Date): Date | null {
  if (!text) return null;
  const s = text.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const base = new Date(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());

  // ISO date (2026-10-14)
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  if (/\btoday\b|\bend of (the )?day\b|\btonight\b/.test(s)) return base;
  if (/\btomorrow\b/.test(s)) return addDays(base, 1);

  // "in 3 days", "in two weeks"
  const inN = s.match(/\bin (\d+|a|an|one|two|three|four|five|six) (day|days|week|weeks)\b/);
  if (inN) {
    const n = /\d/.test(inN[1]!) ? Number(inN[1]) : (NUMBER_WORDS[inN[1]!] ?? 1);
    return addDays(base, inN[2]!.startsWith("week") ? n * 7 : n);
  }

  // "14 October", "October 14", "14th of October"
  for (let m = 0; m < 12; m++) {
    const name = MONTHS[m]!;
    const short = name.slice(0, 3);
    const re = new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (?:${name}|${short})\\b|\\b(?:${name}|${short}) (\\d{1,2})(?:st|nd|rd|th)?\\b`,
    );
    const hit = s.match(re);
    if (hit) {
      const day = Number(hit[1] ?? hit[2]);
      let year = base.getFullYear();
      if (new Date(year, m, day) < base) year += 1; // a date already past means next year
      return new Date(year, m, day);
    }
  }

  // Weekday: "by Wednesday" = the next Wednesday after the meeting; "next Wednesday" = the week after.
  for (let w = 0; w < 7; w++) {
    if (new RegExp(`\\b${WEEKDAYS[w]}\\b`).test(s)) {
      let ahead = (w - base.getDay() + 7) % 7 || 7;
      if (/\bnext\b/.test(s) && ahead < 7) ahead += 7;
      return addDays(base, ahead);
    }
  }

  if (/\b(end of (the|this) week|this week)\b/.test(s)) return addDays(base, (5 - base.getDay() + 7) % 7 || 7);
  if (/\bnext week\b/.test(s)) return addDays(base, 7);
  if (/\b(end of (the|this) month|this month)\b/.test(s)) return new Date(base.getFullYear(), base.getMonth() + 1, 0);
  if (/\bnext month\b/.test(s)) return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());

  // "the 14th" on its own: that day this month, or next month if it has passed.
  const dayOnly = s.match(/\b(?:the )?(\d{1,2})(st|nd|rd|th)\b/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const candidate = new Date(base.getFullYear(), base.getMonth(), day);
    return candidate < base ? new Date(base.getFullYear(), base.getMonth() + 1, day) : candidate;
  }
  return null;
}

/** "Due today", "Due in 3 days", "Overdue by 2 days". */
export function dueLabel(due: Date, now = new Date()): { text: string; tone: "overdue" | "soon" | "later" } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${days} days`, tone: days <= 7 ? "soon" : "later" };
}

// --- Calendar (.ics) ----------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const icsDate = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const escapeIcs = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export interface Reminder {
  uid: string;
  title: string;
  description: string;
  date: Date;
}

/** An iCalendar file with one all-day event per reminder (works with Outlook, Google and Apple calendars). */
export function buildIcs(reminders: Reminder[]): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const events = reminders.map((r) =>
    [
      "BEGIN:VEVENT",
      `UID:${r.uid}@meetcite`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(r.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(r.date, 1))}`,
      `SUMMARY:${escapeIcs(r.title)}`,
      `DESCRIPTION:${escapeIcs(r.description)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(r.title)}`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n"),
  );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MeetCite//Action reminders//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

import { buildIcs, dueLabel, parseDeadline } from "@/lib/deadlines";

// Thursday 8 October 2026
const MEETING = new Date(2026, 9, 8);
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

describe("parseDeadline", () => {
  it.each([
    ["by Wednesday", "2026-10-14"],
    ["next Wednesday", "2026-10-21"],
    ["Friday", "2026-10-9"],
    ["tomorrow", "2026-10-9"],
    ["today", "2026-10-8"],
    ["in two weeks", "2026-10-22"],
    ["in 3 days", "2026-10-11"],
    ["14 October", "2026-10-14"],
    ["October 14th", "2026-10-14"],
    ["5th of January", "2027-1-5"],
    ["the 20th", "2026-10-20"],
    ["next week", "2026-10-15"],
    ["end of the month", "2026-10-31"],
    ["2026-11-02", "2026-11-2"],
  ])("%s -> %s", (said, expected) => {
    expect(ymd(parseDeadline(said, MEETING))).toBe(expected);
  });

  it("never guesses a vague deadline", () => {
    for (const vague of ["ASAP", "soon", "when possible", "", null]) expect(parseDeadline(vague, MEETING)).toBeNull();
  });
});

describe("dueLabel", () => {
  it("describes overdue, today and upcoming deadlines", () => {
    const now = new Date(2026, 9, 10);
    expect(dueLabel(new Date(2026, 9, 8), now)).toEqual({ text: "Overdue by 2 days", tone: "overdue" });
    expect(dueLabel(new Date(2026, 9, 10), now).text).toBe("Due today");
    expect(dueLabel(new Date(2026, 9, 30), now).tone).toBe("later");
  });
});

describe("buildIcs", () => {
  it("writes an all-day event with a reminder", () => {
    const ics = buildIcs([{ uid: "a1", title: "Fix bugs; then ship", description: "From: Planning", date: MEETING }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261008");
    expect(ics).toContain("DTEND;VALUE=DATE:20261009");
    expect(ics).toContain("SUMMARY:Fix bugs\\; then ship");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
  });
});

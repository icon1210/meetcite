import { parseDeadline } from "./deadlines";
import type { MeetingListItem, SeriesAction } from "./types";

/** 3 = act now, 2 = check soon, 1 = worth knowing. */
export type AttentionLevel = 1 | 2 | 3;

export interface AttentionReason {
  kind: "failed" | "overdue" | "changed" | "review" | "unowned" | "due";
  text: string;
  level: AttentionLevel;
  /** Meeting page tab that deals with it ("" for the meeting page itself). */
  tab: string;
}

export interface MeetingAttention {
  meeting: MeetingListItem;
  reasons: AttentionReason[];
  level: AttentionLevel | 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Why a meeting needs someone, most urgent first: processing failed, overdue actions, a decision that
 * changed since an earlier meeting, AI claims nobody has checked yet, actions with no owner, and
 * actions due today or tomorrow. `actions` are the user's open actions across all meetings.
 */
export function meetingAttention(m: MeetingListItem, actions: SeriesAction[], now = new Date()): MeetingAttention {
  const reasons: AttentionReason[] = [];
  if (m.status === "failed") {
    reasons.push({ kind: "failed", text: "Processing stopped", level: 3, tab: "" });
  }
  if (m.status === "completed") {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const open = actions.filter((a) => a.meeting_id === m.id && a.status === "open");
    let overdue = 0;
    let dueSoon = 0;
    for (const a of open) {
      const due = parseDeadline(a.deadline, new Date(a.meeting_date));
      if (!due) continue;
      const days = Math.round((due.getTime() - today) / 86_400_000);
      if (days < 0) overdue++;
      else if (days <= 1) dueSoon++;
    }
    const unowned = open.filter((a) => !a.owner).length;
    if (overdue)
      reasons.push({ kind: "overdue", text: `${plural(overdue, "action")} overdue`, level: 3, tab: "actions" });
    if (m.change_count)
      reasons.push({
        kind: "changed",
        text: `${plural(m.change_count, "decision")} changed since last time`,
        level: 2,
        tab: "memory",
      });
    if (m.review_needed_count)
      reasons.push({
        kind: "review",
        text: `${plural(m.review_needed_count, "claim")} to check`,
        level: 2,
        tab: "evidence",
      });
    if (unowned)
      reasons.push({ kind: "unowned", text: `${plural(unowned, "action")} with no owner`, level: 1, tab: "actions" });
    if (dueSoon) reasons.push({ kind: "due", text: `${plural(dueSoon, "action")} due soon`, level: 1, tab: "actions" });
  }
  const level = reasons.reduce<AttentionLevel | 0>((max, r) => (r.level > max ? r.level : max), 0);
  return { meeting: m, reasons, level };
}

/** Meetings that need someone, most urgent first (then the one with most to do, then the newest). */
export function attentionList(meetings: MeetingListItem[], actions: SeriesAction[], now = new Date()) {
  return meetings
    .map((m) => meetingAttention(m, actions, now))
    .filter((a) => a.level > 0)
    .sort(
      (a, b) =>
        b.level - a.level ||
        b.reasons.length - a.reasons.length ||
        b.meeting.created_at.localeCompare(a.meeting.created_at),
    );
}

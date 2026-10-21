import { describe, expect, it } from "vitest";
import { attentionList, meetingAttention } from "@/lib/attention";
import type { MeetingListItem, SeriesAction } from "@/lib/types";

const NOW = new Date(2026, 9, 21, 10); // Wednesday 21 October 2026

const meeting = (over: Partial<MeetingListItem>): MeetingListItem => ({
  id: 1,
  title: "Weekly sync",
  duration_s: 600,
  status: "completed",
  model_used: "llm",
  source: "upload",
  created_at: "2026-10-14T10:00:00Z",
  stage: "completed",
  progress_pct: 100,
  overview: "",
  speaker_count: 3,
  decision_count: 1,
  open_action_count: 0,
  flagged_count: 0,
  review_needed_count: 0,
  change_count: 0,
  series_id: null,
  series_name: null,
  ...over,
});

const action = (over: Partial<SeriesAction>): SeriesAction => ({
  id: 1,
  meeting_id: 1,
  meeting_title: "Weekly sync",
  meeting_date: "2026-10-14T10:00:00Z",
  task: "Send the report",
  owner: "Tom",
  deadline: null,
  status: "open",
  source_segment_ids: [],
  verdict: "supported",
  ...over,
});

describe("meetingAttention", () => {
  it("is quiet when nothing needs doing", () => {
    expect(meetingAttention(meeting({}), [action({})], NOW).level).toBe(0);
  });

  it("puts a failed meeting at the top level", () => {
    const a = meetingAttention(meeting({ status: "failed" }), [], NOW);
    expect(a.level).toBe(3);
    expect(a.reasons.map((r) => r.kind)).toEqual(["failed"]);
  });

  it("orders reasons from most to least urgent and links each to its tab", () => {
    const a = meetingAttention(
      meeting({ review_needed_count: 2, change_count: 1 }),
      [
        action({ id: 1, deadline: "2026-10-16" }), // overdue
        action({ id: 2, owner: null }), // no owner, no date
        action({ id: 3, deadline: "tomorrow", meeting_date: "2026-10-20T10:00:00Z" }), // due 21 Oct: today
      ],
      NOW,
    );
    expect(a.level).toBe(3);
    expect(a.reasons.map((r) => [r.kind, r.text, r.tab])).toEqual([
      ["overdue", "1 action overdue", "actions"],
      ["changed", "1 decision changed since last time", "memory"],
      ["review", "2 claims to check", "evidence"],
      ["unowned", "1 action with no owner", "actions"],
      ["due", "1 action due soon", "actions"],
    ]);
  });

  it("ignores done actions, other meetings' actions and vague deadlines", () => {
    const a = meetingAttention(
      meeting({}),
      [
        action({ status: "done", deadline: "2026-10-01", owner: null }),
        action({ meeting_id: 2, deadline: "2026-10-01" }),
        action({ deadline: "soon" }),
      ],
      NOW,
    );
    expect(a.reasons).toEqual([]);
  });
});

describe("attentionList", () => {
  it("lists only meetings that need someone, most urgent first", () => {
    const list = attentionList(
      [
        meeting({ id: 1, title: "Fine" }),
        meeting({ id: 2, title: "Check", review_needed_count: 1 }),
        meeting({ id: 3, title: "Broken", status: "failed" }),
        meeting({ id: 4, title: "Busy", status: "processing" }),
      ],
      [],
      NOW,
    );
    expect(list.map((a) => a.meeting.title)).toEqual(["Broken", "Check"]);
  });
});

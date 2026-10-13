import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { Card } from "@/components/ui/misc";
import type { MeetingDetail } from "@/lib/types";
import { cn, formatTimestamp, speakerColour } from "@/lib/utils";
import { TrustBar } from "../Verdict";
import type { TabProps } from "./shared";

interface SpeakerStats {
  name: string;
  index: number;
  seconds: number;
  turns: number;
  words: number;
  questions: number;
  longestTurn: number;
}

export function participation(meeting: MeetingDetail): SpeakerStats[] {
  const stats = new Map<number | null, SpeakerStats>();
  meeting.speakers.forEach((s, index) =>
    stats.set(s.id, { name: s.display_name, index, seconds: 0, turns: 0, words: 0, questions: 0, longestTurn: 0 }),
  );
  let previous: number | null | undefined;
  for (const seg of meeting.segments) {
    const s = stats.get(seg.speaker_id);
    if (!s) continue;
    const length = Math.max(0, seg.end_s - seg.start_s);
    s.seconds += length;
    s.words += seg.text.split(/\s+/).filter(Boolean).length;
    s.questions += (seg.text.match(/\?/g) ?? []).length;
    s.longestTurn = Math.max(s.longestTurn, length);
    if (seg.speaker_id !== previous) s.turns += 1; // a new turn starts when the speaker changes
    previous = seg.speaker_id;
  }
  return [...stats.values()].sort((a, b) => b.seconds - a.seconds);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** Meeting analytics: participation balance, accountability gaps and how trustworthy the notes are. */
export function InsightsTab({ meeting }: TabProps) {
  const speakers = useMemo(() => participation(meeting), [meeting]);
  const totalSeconds = speakers.reduce((n, s) => n + s.seconds, 0) || 1;
  const noOwner = meeting.action_items.filter((a) => !a.owner);
  const noDeadline = meeting.action_items.filter((a) => !a.deadline);
  const openActions = meeting.action_items.filter((a) => a.status === "open").length;
  const dominant = speakers[0] && speakers.length > 1 && speakers[0].seconds / totalSeconds > 0.6 ? speakers[0] : null;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Decisions" value={meeting.decisions.length} />
        <Stat label="Action items" value={meeting.action_items.length} hint={`${openActions} still open`} />
        <Stat label="Open questions" value={meeting.summary?.open_questions.length ?? 0} />
        <Stat label="Topics discussed" value={meeting.summary?.topics.length ?? 0} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Accountability</h2>
        {noOwner.length === 0 && noDeadline.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            Every action item has an owner and a deadline.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {noOwner.length > 0 && (
              <li className="flex gap-2 rounded-md bg-warning px-3 py-2 text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>{noOwner.length}</strong> action {noOwner.length === 1 ? "item has" : "items have"} nobody
                  assigned: {noOwner.map((a) => `“${a.task}”`).join(", ")}.
                </span>
              </li>
            )}
            {noDeadline.length > 0 && (
              <li className="flex gap-2 rounded-md bg-warning px-3 py-2 text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>{noDeadline.length}</strong> action {noDeadline.length === 1 ? "item has" : "items have"} no
                  deadline. Unscheduled tasks are the ones most often forgotten.
                </span>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Participation</h2>
          <p className="text-sm text-muted-foreground">
            How much each person spoke. Rename speakers in the Transcript tab.
          </p>
        </div>
        {dominant && (
          <p className="text-sm text-muted-foreground">
            {dominant.name} spoke for {Math.round((dominant.seconds / totalSeconds) * 100)}% of the meeting.
          </p>
        )}
        <ul className="space-y-3">
          {speakers.map((s) => {
            const share = s.seconds / totalSeconds;
            return (
              <li key={s.name} className="space-y-1">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {`${Math.round(share * 100)}% · ${formatTimestamp(s.seconds)} · ${plural(s.turns, "turn")} · ` +
                      `${plural(s.words, "word")} · ${plural(s.questions, "question")} asked`}
                  </span>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${s.name} spoke for ${Math.round(share * 100)}% of the time`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full border-2",
                      speakerColour(s.index).border,
                      speakerColour(s.index).chip,
                    )}
                    style={{ width: `${Math.max(share * 100, 1)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {meeting.summary && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How reliable are these notes?</h2>
          <Card className="p-4">
            <TrustBar verification={meeting.summary.verification} />
          </Card>
        </section>
      )}
    </div>
  );
}

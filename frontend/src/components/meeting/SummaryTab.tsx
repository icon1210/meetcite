import { Flag, MessagesSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert, Card, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { SummaryPoint, Topic } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { ItemMeta, TrustBar } from "../Verdict";
import { claimRef, type ClaimRef } from "./reviews";
import { useMeetingMutation, type TabProps } from "./shared";

function KeyPointsEditor({
  meetingId,
  points,
  onDone,
}: {
  meetingId: number;
  points: SummaryPoint[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<SummaryPoint[]>(points.map((p) => ({ ...p })));
  const save = useMeetingMutation(meetingId, (summary_points: SummaryPoint[]) =>
    api.updateMeeting(meetingId, { summary_points }),
  );
  const blank: SummaryPoint = {
    text: "",
    source_segment_ids: [],
    has_source: true,
    evidence_status: "user",
    verdict: "user",
    verdict_note: null,
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft, { onSuccess: onDone });
      }}
    >
      {save.isError && <Alert variant="destructive">{(save.error as Error).message}</Alert>}
      {draft.map((p, i) => (
        <div key={i} className="flex gap-2">
          <Textarea
            aria-label={`Key point ${i + 1}`}
            value={p.text}
            rows={2}
            onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, text: e.target.value } : d)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove point ${i + 1}`}
            onClick={() => setDraft(draft.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setDraft([...draft, blank])}>
          <Plus /> Add point
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner />} Save key points
          </Button>
        </div>
      </div>
    </form>
  );
}

function TopicSection({
  topic,
  index,
  summaryId,
  ...props
}: { topic: Topic; index: number; summaryId: number } & Omit<TabProps, "meeting">) {
  const ref = (type: ClaimRef["type"], path: string) => claimRef.inSummary(type, summaryId, path);
  const first = topic.source_segment_ids.map((id) => props.segmentsByPosition.get(id)).find(Boolean);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">
          <span className="mr-2 text-muted-foreground">{index + 1}.</span>
          {topic.title}
        </h3>
        {first && (
          <Button variant="ghost" size="sm" onClick={() => props.onJump([first.position])}>
            Jump to {formatTimestamp(first.start_s)}
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="leading-relaxed">{topic.summary}</p>
        <ItemMeta item={topic} claim={ref("topic", `topic:${index}`)} {...props} />
      </div>

      {topic.positions.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <MessagesSquare className="size-4" aria-hidden /> Who said what
          </h4>
          <ul className="space-y-2">
            {topic.positions.map((pos, i) => (
              <li key={i} className="rounded-md bg-muted/60 px-3 py-2">
                <p>
                  <span className="font-semibold">{pos.speaker}:</span> {pos.view}
                </p>
                <ItemMeta item={pos} claim={ref("position", `topic:${index}:position:${i}`)} {...props} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {topic.points.length > 0 && (
        <ul className="space-y-2">
          {topic.points.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              <div className="space-y-1">
                <p>{p.text}</p>
                <ItemMeta item={p} claim={ref("point", `topic:${index}:point:${i}`)} {...props} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 rounded-md border-l-4 border-primary bg-secondary/60 px-3 py-2 text-sm">
        <Flag className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-semibold">Outcome: </span>
          {topic.outcome ?? <span className="text-muted-foreground">No conclusion was reached on this topic.</span>}
        </p>
      </div>
    </Card>
  );
}

export function SummaryTab({ meeting, segmentsByPosition, onJump }: TabProps) {
  const summary = meeting.summary;
  const [editing, setEditing] = useState(false);
  if (!summary) return <p className="text-muted-foreground">No summary was produced for this meeting.</p>;
  const meta = { segmentsByPosition, onJump };

  return (
    <div className="space-y-8">
      {summary.overview && (
        <section aria-labelledby="overview-heading" className="space-y-2">
          <h2 id="overview-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Overview
          </h2>
          <p className="text-lg leading-relaxed">{summary.overview}</p>
        </section>
      )}

      <Card className="p-4">
        <TrustBar verification={summary.verification} />
      </Card>

      <section aria-labelledby="keypoints-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="keypoints-heading" className="text-xl font-semibold">
            Key points
          </h2>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
        {editing ? (
          <KeyPointsEditor meetingId={meeting.id} points={summary.points} onDone={() => setEditing(false)} />
        ) : summary.points.length === 0 ? (
          <p className="text-muted-foreground">No key points.</p>
        ) : (
          <ul className="space-y-4">
            {summary.points.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <div className="space-y-1">
                  <p className="leading-relaxed">{p.text}</p>
                  <ItemMeta item={p} claim={claimRef.inSummary("point", summary.id, `point:${i}`)} {...meta} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {summary.topics.length > 0 && (
        <section aria-labelledby="minutes-heading" className="space-y-3">
          <div>
            <h2 id="minutes-heading" className="text-xl font-semibold">
              Detailed minutes
            </h2>
            <p className="text-sm text-muted-foreground">
              Topic by topic: what was discussed, each person's position, and what was concluded.
            </p>
          </div>
          {summary.topics.map((topic, i) => (
            <TopicSection key={i} topic={topic} index={i} summaryId={summary.id} {...meta} />
          ))}
        </section>
      )}
    </div>
  );
}

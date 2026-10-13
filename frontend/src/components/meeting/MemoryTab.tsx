import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, GitBranch, History, Layers, ListTodo, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Buddy } from "@/components/Buddy";
import { SeriesSelect } from "@/components/SeriesSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { Alert, Badge, Card, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { ProgressHint, SeriesAction } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SourceLinks } from "../SourceLinks";
import type { TabProps } from "./shared";

/** Link to a moment in another meeting: its transcript opens at that line. */
export function momentLink(meetingId: number, ids: number[]): string {
  return ids.length ? `/meetings/${meetingId}?at=${ids[0]}` : `/meetings/${meetingId}`;
}

/**
 * Series memory: how this meeting connects to earlier ones in its series - actions still open from
 * before (with any reports that they are now done), and decisions that changed since.
 */
export function MemoryTab({ meeting, segmentsByPosition, onJump }: TabProps) {
  const queryClient = useQueryClient();
  const seriesId = meeting.series_id;
  const series = useQuery({
    queryKey: ["series", seriesId],
    queryFn: () => api.getSeries(seriesId!),
    enabled: seriesId !== null,
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshMemory(meeting.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] }),
  });
  const move = useMutation({
    mutationFn: async (id: number | null) => {
      await api.updateMeeting(meeting.id, { series_id: id });
      if (meeting.summary) await api.refreshMemory(meeting.id); // compare with the new series straight away
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
  const markDone = useMutation({
    mutationFn: (actionId: number) => api.editActionItem(actionId, { status: "done" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["meeting"] });
    },
  });

  const continuity = meeting.summary?.continuity ?? {};
  const progressByAction = new Map<number, ProgressHint>((continuity.progress ?? []).map((p) => [p.action_id, p]));
  const carried: SeriesAction[] = (series.data?.actions ?? []).filter(
    (a) => a.status === "open" && new Date(a.meeting_date) < new Date(meeting.created_at),
  );
  const contradictions = continuity.contradictions ?? [];
  const working = move.isPending || refresh.isPending;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <Label htmlFor="meeting-series" className="flex items-center gap-1.5">
            <Layers className="size-4" aria-hidden /> Meeting series
          </Label>
          <SeriesSelect id="meeting-series" value={seriesId} onChange={(id) => move.mutate(id)} disabled={working} />
        </div>
        <div className="flex flex-wrap gap-2">
          {seriesId !== null && (
            <Button asChild variant="outline">
              <Link to={`/series/${seriesId}`}>
                Open series <ArrowRight />
              </Link>
            </Button>
          )}
          {seriesId !== null && meeting.summary && (
            <Button variant="ghost" onClick={() => refresh.mutate()} disabled={working}>
              {working ? <Spinner /> : <RefreshCw />} Re-check
            </Button>
          )}
        </div>
      </Card>
      {(move.isError || refresh.isError) && (
        <Alert variant="destructive">{((move.error ?? refresh.error) as Error).message}</Alert>
      )}

      {seriesId === null ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Buddy mood="idle" size={90} />
          <p className="font-medium">This meeting isn't part of a series yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Add it to a series (for example "Weekly team meeting") and MeetCite will carry open actions over between
            meetings, keep one decision history and flag decisions that change.
          </p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="carried" className="space-y-3">
            <h3 id="carried" className="flex items-center gap-2 text-lg font-semibold">
              <ListTodo className="size-5 text-primary" aria-hidden /> Still open from earlier meetings
            </h3>
            {series.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading the series…
              </p>
            )}
            {series.data && carried.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> Nothing outstanding from earlier
                meetings.
              </p>
            )}
            <ul className="space-y-2">
              {carried.map((a) => {
                const hint = progressByAction.get(a.id);
                return (
                  <li key={a.id}>
                    <Card className={hint ? "border-l-4 border-l-emerald-500 p-4" : "p-4"}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{a.task}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.owner ? `${a.owner} · ` : ""}
                            {a.deadline ? `due ${a.deadline} · ` : ""}from{" "}
                            <Link
                              className="underline underline-offset-2"
                              to={momentLink(a.meeting_id, a.source_segment_ids)}
                            >
                              {a.meeting_title}
                            </Link>{" "}
                            ({formatDate(a.meeting_date)})
                          </p>
                          {hint && (
                            <div className="mt-2 space-y-1 rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/50">
                              <p className="font-medium text-emerald-800 dark:text-emerald-200">
                                {hint.status === "done" ? "Reported done in this meeting" : "Reported in progress"}
                              </p>
                              <p className="text-emerald-900/80 dark:text-emerald-100/80">“{hint.current}”</p>
                              <SourceLinks
                                ids={hint.source_segment_ids}
                                hasSource
                                segmentsByPosition={segmentsByPosition}
                                onJump={onJump}
                              />
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={hint?.status === "done" ? "default" : "outline"}
                          onClick={() => markDone.mutate(a.id)}
                          disabled={markDone.isPending}
                        >
                          <CheckCircle2 /> Mark done
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="changes" className="space-y-3">
            <h3 id="changes" className="flex items-center gap-2 text-lg font-semibold">
              <GitBranch className="size-5 text-primary" aria-hidden /> Changes since earlier meetings
            </h3>
            {!meeting.summary?.continuity?.method && (
              <p className="text-sm text-muted-foreground">
                Not checked yet. Press <strong>Re-check</strong> to compare this meeting with earlier ones in the
                series.
              </p>
            )}
            {meeting.summary?.continuity?.method && contradictions.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> No earlier decision was changed or
                contradicted.
              </p>
            )}
            <ul className="space-y-3">
              {contradictions.map((c, i) => (
                <li key={i}>
                  <Card className="space-y-3 border-l-4 border-l-amber-500 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <History className="size-3.5" aria-hidden /> Earlier · {c.previous_meeting_title} (
                          {c.previous_meeting_date})
                        </p>
                        <p>{c.previous_decision}</p>
                        <Link
                          className="text-xs font-medium text-primary underline underline-offset-2"
                          to={momentLink(c.previous_meeting_id, c.previous_source_ids)}
                        >
                          Hear where it was decided
                        </Link>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          In this meeting
                        </p>
                        <p>{c.current}</p>
                        <SourceLinks
                          ids={c.source_segment_ids}
                          hasSource
                          segmentsByPosition={segmentsByPosition}
                          onJump={onJump}
                        />
                      </div>
                    </div>
                    {c.note && (
                      <p className="text-sm">
                        <Badge variant="warning">Changed</Badge> <span className="text-muted-foreground">{c.note}</span>
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
            {meeting.summary?.continuity?.method === "word-overlap" && (
              <p className="text-xs text-muted-foreground">
                Checked by word matching (less reliable): the AI comparison was not available.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

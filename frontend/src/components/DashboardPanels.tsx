import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, ArrowRight, BellRing, CheckCircle2, Layers, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { momentLink } from "@/components/meeting/MemoryTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Badge, Card } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { AttentionLevel, AttentionReason, MeetingAttention } from "@/lib/attention";
import { dueLabel, parseDeadline } from "@/lib/deadlines";
import { cn, formatDate } from "@/lib/utils";

const LEVEL_NAME: Record<AttentionLevel, string> = { 3: "Urgent", 2: "Check", 1: "Heads-up" };
const LEVEL_DOT: Record<AttentionLevel, string> = { 3: "bg-red-500", 2: "bg-amber-500", 1: "bg-sky-500" };
export const REASON_TONE: Record<AttentionLevel, string> = {
  3: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  2: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  1: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

/** A reason chip that opens the meeting on the tab that deals with it. */
export function ReasonLink({ meetingId, reason }: { meetingId: number; reason: AttentionReason }) {
  return (
    <Link
      to={reason.tab ? `/meetings/${meetingId}?tab=${reason.tab}` : `/meetings/${meetingId}`}
      className={cn(
        "relative z-10 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline",
        REASON_TONE[reason.level],
      )}
    >
      {reason.text}
    </Link>
  );
}

/**
 * The meetings that need someone, most urgent first, each with what to do and a link straight to it.
 * Shows "all caught up" once there is something to check but nothing needs doing.
 */
export function AttentionPanel({ items, onShowAll }: { items: MeetingAttention[]; onShowAll: () => void }) {
  const shown = items.slice(0, 5);
  return (
    <section aria-labelledby="attention-heading" className="min-w-0 space-y-3">
      <h2 id="attention-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <BellRing className="size-5 text-primary" aria-hidden /> Needs your attention
        {items.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
            {items.length}
          </span>
        )}
      </h2>
      {items.length === 0 ? (
        <Card className="flex items-center gap-3 p-5 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <strong>All caught up.</strong>{" "}
            <span className="text-muted-foreground">
              No failed uploads, overdue actions, changed decisions or claims waiting to be checked.
            </span>
          </span>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          <ul aria-label="Meetings that need attention" className="divide-y">
            {shown.map(({ meeting: m, reasons, level }) => (
              <li key={m.id} className="flex gap-3 p-4">
                <span
                  className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", level ? LEVEL_DOT[level] : "")}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <Link to={`/meetings/${m.id}`} className="font-medium underline-offset-4 hover:underline">
                      {m.title}
                    </Link>
                    {level > 0 && <span className="sr-only">{LEVEL_NAME[level as AttentionLevel]}:</span>}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(m.created_at)}
                      {m.series_name ? ` · ${m.series_name}` : ""}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reasons.map((r) => (
                      <ReasonLink key={r.kind} meetingId={m.id} reason={r} />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {items.length > shown.length && (
            <button
              type="button"
              onClick={onShowAll}
              className="w-full p-3 text-sm font-medium text-primary hover:bg-muted"
            >
              Show all {items.length} in the library
            </button>
          )}
        </Card>
      )}
    </section>
  );
}

/** The user's meeting series (project memory), with a quick way to start a new one. */
export function SeriesPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const series = useQuery({ queryKey: ["series"], queryFn: api.listSeries });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.createSeries(name.trim()),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      navigate(`/series/${s.id}`);
    },
  });

  return (
    <section aria-labelledby="series-heading" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="series-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Layers className="size-5 text-primary" aria-hidden /> Meeting series
        </h2>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> New series
          </Button>
        )}
      </div>
      {adding && (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input
            autoFocus
            aria-label="New series name"
            placeholder="e.g. Weekly team meeting, Thesis supervision"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Create
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      )}
      {series.data && series.data.length === 0 && !adding && (
        <Card className="p-5 text-sm text-muted-foreground">
          Group recurring meetings, such as a weekly team meeting or thesis supervision, into a series. MeetCite then
          carries open actions over, keeps one decision history and flags decisions that change.
        </Card>
      )}
      {series.data && series.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {series.data.map((s) => (
            <li key={s.id}>
              <Link to={`/series/${s.id}`} className="group block">
                <Card className="relative overflow-hidden p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-orange-500 via-rose-500 to-fuchsia-500" />
                  <p className="flex items-center justify-between gap-2 break-words pl-2 font-semibold">
                    {s.name}
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </p>
                  <p className="mt-1 pl-2 text-xs text-muted-foreground">
                    {s.meeting_count} meeting{s.meeting_count === 1 ? "" : "s"} · {s.open_action_count} open action
                    {s.open_action_count === 1 ? "" : "s"}
                    {s.last_meeting_at ? ` · last ${formatDate(s.last_meeting_at)}` : ""}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Open actions from every meeting, soonest deadline first. */
export function DueSoonPanel() {
  const actions = useQuery({ queryKey: ["meetings", "__open-actions"], queryFn: api.openActions });
  const rows = (actions.data ?? [])
    .map((a) => ({ a, due: parseDeadline(a.deadline, new Date(a.meeting_date)) }))
    .filter((r): r is { a: (typeof r)["a"]; due: Date } => r.due !== null)
    .sort((x, y) => x.due.getTime() - y.due.getTime())
    .slice(0, 6);
  const undated = (actions.data?.length ?? 0) - rows.length;
  if (!actions.data || actions.data.length === 0) return null;

  return (
    <section aria-labelledby="due-heading" className="min-w-0 space-y-3">
      <h2 id="due-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <AlarmClock className="size-5 text-primary" aria-hidden /> Due soon
      </h2>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> No dated deadlines coming up.
        </p>
      ) : (
        <Card className="divide-y">
          {rows.map(({ a, due }) => {
            const label = dueLabel(due);
            return (
              <Link
                key={a.id}
                to={momentLink(a.meeting_id, a.source_segment_ids)}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.task}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.owner ?? "No owner stated"} · {a.meeting_title}
                  </p>
                </div>
                <Badge
                  variant={label.tone === "overdue" ? "destructive" : label.tone === "soon" ? "warning" : "default"}
                  className={cn("shrink-0")}
                >
                  {label.text}
                </Badge>
              </Link>
            );
          })}
        </Card>
      )}
      {undated > 0 && (
        <p className="text-xs text-muted-foreground">
          {undated} more open action{undated === 1 ? " has" : "s have"} no specific deadline.
        </p>
      )}
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileAudio,
  Gavel,
  GitBranch,
  ListTodo,
  MessageCircleQuestion,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BuddyWithMessage } from "@/components/Buddy";
import { momentLink } from "@/components/meeting/MemoryTab";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, Spinner } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { dueLabel, parseDeadline } from "@/lib/deadlines";
import type { SeriesDetail, SeriesSource } from "@/lib/types";
import { cn, formatDate, formatDuration, formatTimestamp } from "@/lib/utils";

function ActionTracker({ series }: { series: SeriesDetail }) {
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState("");
  const [showDone, setShowDone] = useState(false);
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api.editActionItem(id, { status: done ? "done" : "open" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["series", series.id] }),
  });
  const owners = [...new Set(series.actions.map((a) => a.owner ?? "Unassigned"))].sort();
  const rows = series.actions
    .filter((a) => (showDone ? true : a.status === "open"))
    .filter((a) => !owner || (a.owner ?? "Unassigned") === owner)
    .map((a) => ({ a, due: parseDeadline(a.deadline, new Date(a.meeting_date)) }))
    .sort((x, y) => (x.due?.getTime() ?? Infinity) - (y.due?.getTime() ?? Infinity));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select aria-label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-56">
          <option value="">Everyone</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Show done
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> No open actions. Everything is done!
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ a, due }) => {
            const label = due && a.status === "open" ? dueLabel(due) : null;
            const done = a.status === "done";
            const badge = (className: string) =>
              label && (
                <Badge
                  className={className}
                  variant={label.tone === "overdue" ? "destructive" : label.tone === "soon" ? "warning" : "default"}
                >
                  {label.text}
                </Badge>
              );
            return (
              <li key={a.id}>
                <Card className="flex items-start gap-3 p-4">
                  <button
                    type="button"
                    aria-pressed={done}
                    aria-label={done ? `Reopen: ${a.task}` : `Mark done: ${a.task}`}
                    onClick={() => toggle.mutate({ id: a.id, done: !done })}
                    className="mt-0.5 text-primary"
                  >
                    {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", done && "text-muted-foreground line-through")}>{a.task}</p>
                    {/* On phones the deadline badge sits under the task, so the task text keeps the full width. */}
                    {badge("my-1 sm:hidden")}
                    <p className="text-xs text-muted-foreground">
                      {a.owner ?? "No owner stated"}
                      {a.deadline ? ` · due ${a.deadline}` : ""} · from{" "}
                      <Link
                        className="underline underline-offset-2"
                        to={momentLink(a.meeting_id, a.source_segment_ids)}
                      >
                        {a.meeting_title}
                      </Link>{" "}
                      ({formatDate(a.meeting_date)})
                    </p>
                  </div>
                  {badge("hidden shrink-0 sm:inline-flex")}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DecisionHistory({ series }: { series: SeriesDetail }) {
  const changed = new Set(series.contradictions.map((c) => c.previous_decision));
  if (series.decisions.length === 0) return <p className="text-sm text-muted-foreground">No decisions yet.</p>;
  return (
    <ol className="relative space-y-4 border-l-2 border-primary/30 pl-6">
      {series.decisions.map((d) => (
        <li key={d.id} className="relative">
          <span className="absolute -left-[1.95rem] top-1 size-3.5 rounded-full border-2 border-background bg-primary" />
          <p className="text-xs font-medium text-muted-foreground">
            {formatDate(d.meeting_date)} · {d.meeting_title}
          </p>
          <p className={cn("mt-0.5", changed.has(d.text) && "text-muted-foreground line-through")}>{d.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Link
              className="text-xs font-medium text-primary underline underline-offset-2"
              to={momentLink(d.meeting_id, d.source_segment_ids)}
            >
              Hear it
            </Link>
            {changed.has(d.text) && <Badge variant="warning">Changed later</Badge>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Changes({ series }: { series: SeriesDetail }) {
  if (!series.contradictions.length && !series.progress.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> No changed decisions or progress reports yet.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {series.contradictions.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Decisions that changed</h3>
          {series.contradictions.map((c, i) => (
            <Card key={i} className="grid gap-3 border-l-4 border-l-amber-500 p-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Earlier · {c.previous_meeting_title}
                </p>
                <p className="mt-1">{c.previous_decision}</p>
                <Link
                  className="text-xs font-medium text-primary underline underline-offset-2"
                  to={momentLink(c.previous_meeting_id, c.previous_source_ids)}
                >
                  Hear it
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Later · {c.meeting_title}
                </p>
                <p className="mt-1">{c.current}</p>
                <Link
                  className="text-xs font-medium text-primary underline underline-offset-2"
                  to={momentLink(c.meeting_id!, c.source_segment_ids)}
                >
                  Hear it
                </Link>
                {c.note && <p className="mt-2 text-sm text-muted-foreground">{c.note}</p>}
              </div>
            </Card>
          ))}
        </section>
      )}
      {series.progress.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Progress reported on earlier actions</h3>
          {series.progress.map((p, i) => (
            <Card key={i} className="border-l-4 border-l-emerald-500 p-4">
              <p className="font-medium">
                {p.task} <Badge variant="success">{p.status === "done" ? "Reported done" : "In progress"}</Badge>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">“{p.current}”</p>
              <Link
                className="text-xs font-medium text-primary underline underline-offset-2"
                to={momentLink(p.meeting_id, p.source_segment_ids)}
              >
                Hear it
              </Link>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function AskSeries({ series }: { series: SeriesDetail }) {
  const [question, setQuestion] = useState("");
  const ask = useMutation({ mutationFn: (q: string) => api.askSeries(series.id, q) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length >= 3) ask.mutate(question.trim());
  };
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="Question about this series"
          placeholder="e.g. When did we last discuss the budget?"
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" disabled={ask.isPending || question.trim().length < 3}>
          {ask.isPending ? <Spinner /> : <Send />} Ask
        </Button>
      </form>
      {ask.isPending && (
        <BuddyWithMessage mood="thinking" message="Searching every meeting in this series…" size={72} />
      )}
      {ask.isError && <BuddyWithMessage mood="sad" message={(ask.error as Error).message} variant="error" size={72} />}
      {ask.data && (
        <Card className="space-y-3 p-5">
          <p className="leading-relaxed">{ask.data.answer}</p>
          {ask.data.sources.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</p>
              {ask.data.sources.map((s: SeriesSource, i) => (
                <Link
                  key={i}
                  to={momentLink(s.meeting_id, [s.position])}
                  className="block rounded-md bg-muted/60 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="text-xs text-muted-foreground">
                    {s.meeting_title} · {formatTimestamp(s.start_s)} · {s.speaker}
                  </span>
                  <span className="block">“{s.text}”</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function SeriesPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["series", id], queryFn: () => api.getSeries(id), enabled: !!id });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const rename = useMutation({
    mutationFn: () => api.renameSeries(id, name.trim()),
    onSuccess: () => {
      setRenaming(false);
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSeries(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      navigate("/");
    },
  });
  const series = query.data;
  const openCount = useMemo(() => series?.actions.filter((a) => a.status === "open").length ?? 0, [series]);

  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading series…
      </p>
    );
  }
  if (!series) return <Alert variant="destructive">{(query.error as Error)?.message ?? "Series not found."}</Alert>;

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All meetings
      </Link>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-700 via-rose-700 to-fuchsia-800 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/85">Meeting series</p>
            {renaming ? (
              <form
                className="mt-1 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) rename.mutate();
                }}
              >
                <Input
                  autoFocus
                  aria-label="Series name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white text-foreground"
                />
                <Button type="submit" className="bg-white text-rose-800 hover:bg-white/90">
                  Save
                </Button>
              </form>
            ) : (
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
                {series.name}
                <button
                  type="button"
                  aria-label="Rename series"
                  className="rounded p-1 text-white/80 hover:text-white"
                  onClick={() => {
                    setName(series.name);
                    setRenaming(true);
                  }}
                >
                  <Pencil className="size-5" />
                </button>
              </h1>
            )}
            <p className="mt-2 text-sm text-white/90">
              {series.meeting_count} meeting{series.meeting_count === 1 ? "" : "s"} · {openCount} open action
              {openCount === 1 ? "" : "s"} · {series.decisions.length} decision
              {series.decisions.length === 1 ? "" : "s"}
              {series.contradictions.length > 0 && ` · ${series.contradictions.length} changed`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-white text-rose-800 shadow hover:bg-white/90">
              <Link to={`/upload?series=${series.id}`}>
                <Plus /> Add a meeting
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-white/50 bg-[#2a0e2e] text-white hover:bg-[#3b1240]"
              onClick={() => setDeleting(true)}
            >
              <Trash2 /> Remove series
            </Button>
          </div>
        </div>
      </section>

      <Tabs defaultValue="actions">
        <TabsList className="max-w-full">
          <TabsTrigger value="actions">
            <ListTodo className="size-4" aria-hidden /> Actions ({openCount})
          </TabsTrigger>
          <TabsTrigger value="decisions">
            <Gavel className="size-4" aria-hidden /> Decision history
          </TabsTrigger>
          <TabsTrigger value="changes">
            <GitBranch className="size-4" aria-hidden /> Changes ({series.contradictions.length})
          </TabsTrigger>
          <TabsTrigger value="meetings">
            <FileAudio className="size-4" aria-hidden /> Meetings ({series.meeting_count})
          </TabsTrigger>
          <TabsTrigger value="ask">
            <MessageCircleQuestion className="size-4" aria-hidden /> Ask across meetings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="actions">
          <ActionTracker series={series} />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionHistory series={series} />
        </TabsContent>
        <TabsContent value="changes">
          <Changes series={series} />
        </TabsContent>
        <TabsContent value="meetings">
          <ul className="space-y-2">
            {series.meetings.map((m) => (
              <li key={m.id}>
                <Card className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link to={`/meetings/${m.id}`} className="font-medium underline-offset-4 hover:underline">
                      {m.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(m.created_at)} · {formatDuration(m.duration_s)} · {m.decision_count} decisions ·{" "}
                      {m.open_action_count} open actions
                    </p>
                  </div>
                  <StatusBadge status={m.status} />
                </Card>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="ask">
          <AskSeries series={series} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Remove this series?"
        description="The meetings are kept; they just stop being grouped. Their minutes and actions stay as they are."
      >
        {remove.isError && <Alert variant="destructive">{(remove.error as Error).message}</Alert>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending && <Spinner />} Remove series
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  ClipboardCheck,
  Copy,
  ListChecks,
  Mail,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { buildIcs, downloadFile, dueLabel, parseDeadline, type Reminder } from "@/lib/deadlines";
import type { AgendaItemReview, MeetingDetail } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { SourceLinks } from "../SourceLinks";
import type { TabProps } from "./shared";

const STATUS: Record<AgendaItemReview["status"], { label: string; Icon: typeof CheckCircle2; tone: string }> = {
  covered: { label: "Covered", Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  partly: { label: "Partly covered", Icon: CircleDashed, tone: "text-amber-600 dark:text-amber-400" },
  not_covered: { label: "Not covered", Icon: CircleSlash, tone: "text-red-600 dark:text-red-400" },
};

/** A plain-text follow-up email built from the minutes (nothing is sent anywhere by MeetCite). */
export function followUpEmail(meeting: MeetingDetail): { subject: string; body: string } {
  const s = meeting.summary;
  const lines: string[] = [
    `Hi all,`,
    ``,
    `Here are the minutes from "${meeting.title}" (${formatDate(meeting.created_at)}).`,
  ];
  if (s?.overview) lines.push("", s.overview);
  if (meeting.decisions.length) {
    lines.push("", "Decisions:");
    meeting.decisions.forEach((d) => lines.push(`- ${d.text}`));
  }
  const open = meeting.action_items.filter((a) => a.status !== "done");
  if (open.length) {
    lines.push("", "Actions:");
    const byOwner = new Map<string, typeof open>();
    open.forEach((a) => byOwner.set(a.owner ?? "Unassigned", [...(byOwner.get(a.owner ?? "Unassigned") ?? []), a]));
    byOwner.forEach((items, owner) => {
      lines.push(`${owner}:`);
      items.forEach((a) => lines.push(`  - ${a.task}${a.deadline ? ` (by ${a.deadline})` : ""}`));
    });
  }
  if (s?.open_questions.length) {
    lines.push("", "Still to be resolved:");
    s.open_questions.forEach((q) => lines.push(`- ${q.text}`));
  }
  lines.push("", "These notes were drafted with MeetCite (AI-generated) and checked against the recording.", "");
  return { subject: `Minutes: ${meeting.title} (${formatDate(meeting.created_at)})`, body: lines.join("\n") };
}

function AgendaSection({ meeting, segmentsByPosition, onJump }: TabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!meeting.agenda);
  const [draft, setDraft] = useState(meeting.agenda ?? "");
  const save = useMutation({
    mutationFn: async () => {
      await api.updateMeeting(meeting.id, { agenda: draft.trim() || null });
      if (meeting.summary) await api.refreshMemory(meeting.id);
    },
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] });
    },
  });
  const review = meeting.summary?.agenda_review ?? {};

  return (
    <section aria-labelledby="agenda-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="agenda-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks className="size-5 text-primary" aria-hidden /> Agenda check
        </h3>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {meeting.agenda ? "Edit agenda" : "Add agenda"}
          </Button>
        )}
      </div>

      {editing ? (
        <Card className="space-y-3 p-4">
          <Label htmlFor="agenda-edit">Planned agenda, one item per line</Label>
          <Textarea
            id="agenda-edit"
            rows={4}
            value={draft}
            maxLength={5000}
            placeholder={"Launch date\nBudget\nHiring plan"}
            onChange={(e) => setDraft(e.target.value)}
          />
          {save.isError && <Alert variant="destructive">{(save.error as Error).message}</Alert>}
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Spinner />} Save and check
            </Button>
            {meeting.agenda && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </Card>
      ) : review.items?.length ? (
        <>
          <ul className="space-y-2">
            {review.items.map((item) => {
              const st = STATUS[item.status];
              return (
                <li key={item.item}>
                  <Card className="flex gap-3 p-4">
                    <st.Icon className={cn("mt-0.5 size-5 shrink-0", st.tone)} aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">
                        {item.item} <span className={cn("text-sm font-normal", st.tone)}>· {st.label}</span>
                      </p>
                      {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
                      {item.topics.length > 0 && (
                        <p className="text-xs text-muted-foreground">Discussed under: {item.topics.join(", ")}</p>
                      )}
                      {/* An item that wasn't discussed has no source, and that's expected: show nothing. */}
                      {item.source_segment_ids.length > 0 && (
                        <SourceLinks
                          ids={item.source_segment_ids}
                          hasSource
                          segmentsByPosition={segmentsByPosition}
                          onJump={onJump}
                        />
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {review.unplanned && review.unplanned.length > 0 && (
            <Card className="flex flex-wrap items-center gap-2 p-4 text-sm">
              <Plus className="size-4 text-primary" aria-hidden />
              <span className="font-medium">Also discussed (not on the agenda):</span>
              {review.unplanned.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </Card>
          )}
          {review.method === "word-overlap" && (
            <p className="text-xs text-muted-foreground">Checked by word matching (less reliable).</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add the planned agenda to see what was covered, skipped or added.
        </p>
      )}
    </section>
  );
}

function EmailSection({ meeting }: { meeting: MeetingDetail }) {
  const { subject, body } = useMemo(() => followUpEmail(meeting), [meeting]);
  const [copied, setCopied] = useState(false);
  // Email apps cap the length of a mailto link; long minutes are copied instead.
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const tooLong = mailto.length > 1900;

  return (
    <section aria-labelledby="email-heading" className="space-y-3">
      <h3 id="email-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Mail className="size-5 text-primary" aria-hidden /> Follow-up email
      </h3>
      <Card className="space-y-3 p-4">
        <p className="text-sm">
          <span className="text-muted-foreground">Subject:</span> {subject}
        </p>
        <Textarea aria-label="Follow-up email text" readOnly rows={10} value={body} className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(`${subject}\n\n${body}`);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            }}
          >
            {copied ? <ClipboardCheck /> : <Copy />} {copied ? "Copied" : "Copy email"}
          </Button>
          {!tooLong && (
            <Button asChild variant="outline">
              <a href={mailto}>
                <Mail /> Open in email app
              </a>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          MeetCite doesn't send anything: you choose who receives it.
          {tooLong && " These minutes are long, so copy them into a new email."}
        </p>
      </Card>
    </section>
  );
}

function RemindersSection({ meeting }: { meeting: MeetingDetail }) {
  const meetingDate = new Date(meeting.created_at);
  const rows = meeting.action_items
    .filter((a) => a.status !== "done")
    .map((a) => ({ a, due: parseDeadline(a.deadline, meetingDate) }));
  const reminder = (a: (typeof rows)[number]["a"], due: Date): Reminder => ({
    uid: `action-${a.id}`,
    title: `${a.task}${a.owner ? ` (${a.owner})` : ""}`,
    description: `Action from "${meeting.title}" on ${formatDate(meeting.created_at)}. Deadline as said: ${a.deadline}.`,
    date: due,
  });
  const dated = rows.filter((r): r is { a: (typeof rows)[number]["a"]; due: Date } => r.due !== null);

  return (
    <section aria-labelledby="reminders-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="reminders-heading" className="flex items-center gap-2 text-lg font-semibold">
          <CalendarPlus className="size-5 text-primary" aria-hidden /> Deadline reminders
        </h3>
        {dated.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(
                `${meeting.title}-reminders.ics`,
                buildIcs(dated.map((r) => reminder(r.a, r.due))),
                "text/calendar",
              )
            }
          >
            <CalendarPlus /> Add all to calendar
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open actions.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ a, due }) => {
            const label = due ? dueLabel(due) : null;
            return (
              <li key={a.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{a.task}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.owner ?? "No owner stated"} ·{" "}
                      {a.deadline ? (
                        <>
                          said “{a.deadline}”
                          {due &&
                            ` → ${due.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`}
                        </>
                      ) : (
                        "no deadline stated"
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {label && (
                      <Badge
                        variant={
                          label.tone === "overdue" ? "destructive" : label.tone === "soon" ? "warning" : "default"
                        }
                      >
                        {label.text}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!due}
                      title={due ? "Download a calendar reminder" : "The deadline isn't a specific date"}
                      onClick={() =>
                        due && downloadFile(`${a.task.slice(0, 40)}.ics`, buildIcs([reminder(a, due)]), "text/calendar")
                      }
                    >
                      <CalendarPlus /> Add to calendar
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Deadlines are worked out from the meeting date (e.g. "by Wednesday"). Vague ones like "ASAP" aren't turned into
        dates.
      </p>
    </section>
  );
}

/** Before-and-after of one meeting: was the agenda covered, and what happens next. */
export function FollowUpTab(props: TabProps) {
  if (!props.meeting.summary) return <p className="text-sm text-muted-foreground">No minutes yet.</p>;
  return (
    <div className="space-y-8">
      <AgendaSection {...props} />
      <EmailSection meeting={props.meeting} />
      <RemindersSection meeting={props.meeting} />
    </div>
  );
}

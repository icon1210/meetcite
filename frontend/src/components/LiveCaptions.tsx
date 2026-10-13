import { CheckCircle2, CircleHelp, Gavel, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { CaptionTurn, LiveStatus } from "@/lib/useLiveCaptions";

type Notes = Awaited<ReturnType<typeof api.liveNotes>>;

const STATUS_LABEL: Record<LiveStatus, string> = {
  off: "Off",
  connecting: "Connecting…",
  live: "Live",
  ended: "Finished",
  error: "Unavailable",
};

/** Captions as they are spoken, plus quick notes (likely decisions, actions and questions). */
export function LiveCaptions({ status, turns }: { status: LiveStatus; turns: CaptionTurn[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const finals = turns.filter((t) => t.final);
  const finalCount = finals.length;
  const finalsRef = useRef(finals);
  finalsRef.current = finals;

  // Follow the newest caption, unless the user has scrolled up to reread something.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Refresh the quick notes every 20 s while new sentences arrive, and once more at the end.
  const sentCount = useRef(0);
  useEffect(() => {
    const refresh = () => {
      const current = finalsRef.current;
      if (current.length === 0 || current.length === sentCount.current) return;
      sentCount.current = current.length;
      api
        .liveNotes(current.slice(-2000).map((t) => ({ text: t.text })))
        .then(setNotes)
        .catch(() => {}); // quick notes are a bonus; the full minutes come after upload
    };
    if (status !== "live") {
      refresh();
      return;
    }
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const hasNotes = notes && (notes.decisions.length || notes.actions.length || notes.questions.length);

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="space-y-2 p-4 md:col-span-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Radio className={status === "live" ? "size-4 animate-pulse text-red-600" : "size-4"} aria-hidden />
          Live captions
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{STATUS_LABEL[status]}</span>
        </h2>
        <div
          ref={box}
          className="h-64 space-y-2 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm leading-relaxed"
          aria-live="polite"
          aria-label="Live captions"
        >
          {turns.length === 0 ? (
            <p className="text-muted-foreground">
              {status === "connecting" ? "Connecting to live captions…" : "Captions appear here as people speak."}
            </p>
          ) : (
            turns.map((t) => (
              <p key={t.order} className={t.final ? "" : "text-muted-foreground italic"}>
                {t.text}
              </p>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Captions are a preview. The full transcript, speakers and checked minutes are made after you upload.
        </p>
      </Card>

      <Card className="space-y-3 p-4 md:col-span-2">
        <h2 className="text-sm font-semibold">Quick notes</h2>
        {!hasNotes ? (
          <p className="text-sm text-muted-foreground">
            {finalCount === 0
              ? "Likely decisions, actions and questions will appear here."
              : "Listening for decisions, actions and questions… (updates every 20 seconds)"}
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <NoteList icon={Gavel} title="Decisions" items={notes.decisions} />
            <NoteList
              icon={CheckCircle2}
              title="Actions"
              items={notes.actions.map(
                (a) => `${a.task}${a.owner ? ` (${a.owner})` : ""}${a.deadline ? ` · by ${a.deadline}` : ""}`,
              )}
            />
            <NoteList icon={CircleHelp} title="Questions" items={notes.questions} />
          </div>
        )}
      </Card>
    </div>
  );
}

function NoteList({ icon: Icon, title, items }: { icon: typeof Gavel; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {title}
      </h3>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

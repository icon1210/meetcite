import { Check, CircleAlert, RefreshCw } from "lucide-react";
import type { MeetingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BuddyWithMessage, moodFor, useAnnouncedMood, type BubbleVariant } from "./Buddy";
import { Button } from "./ui/button";
import { Card, ProgressBar, Spinner } from "./ui/misc";

// The user-facing stage names from the spec's UI design (§13).
const STAGES: { keys: string[]; label: string }[] = [
  { keys: ["queued", "preprocessing"], label: "Preparing audio" },
  { keys: ["transcribing"], label: "Transcribing" },
  { keys: ["diarizing", "aligning"], label: "Identifying speakers" },
  { keys: ["summarizing"], label: "Summarizing" },
  { keys: ["verifying"], label: "Checking evidence" },
];

// What Mindy says at each stage.
const BUDDY_LINES: Record<string, string> = {
  queued: "Getting ready to start…",
  preprocessing: "Getting your audio ready…",
  transcribing: "Listening carefully to every word…",
  diarizing: "Working out who said what…",
  aligning: "Putting the transcript together…",
  summarizing: "Writing your minutes…",
  verifying: "Checking every claim against the transcript…",
  completed: "All done! Your minutes are ready.",
};

function stageIndex(stage: string): number {
  if (stage === "completed") return STAGES.length;
  const i = STAGES.findIndex((s) => s.keys.includes(stage));
  return i === -1 ? 0 : i;
}

export function ProcessingPanel({
  status,
  onRetry,
  retrying,
}: {
  status: MeetingStatus;
  onRetry: () => void;
  retrying: boolean;
}) {
  const failed = status.status === "failed";
  const current = stageIndex(status.stage);
  const mood = useAnnouncedMood(moodFor(status.status, status.stage));
  // Mindy delivers the failure reason, then any warning, otherwise what she's doing now.
  const warning = status.warnings[status.warnings.length - 1];
  const bubble: { message: string; variant: BubbleVariant } = failed
    ? { message: `Sorry, that didn't work: ${status.error ?? "an unknown error occurred."}`, variant: "error" }
    : warning
      ? { message: warning, variant: "warning" }
      : { message: BUDDY_LINES[status.stage] ?? "Working on it…", variant: "info" };

  return (
    <Card className="mx-auto max-w-xl p-6">
      <BuddyWithMessage mood={mood} message={bubble.message} variant={bubble.variant} className="mb-5 justify-center" />
      <h2 className="text-lg font-semibold">{failed ? "Processing failed" : "Processing your meeting"}</h2>
      {!failed && (
        <p className="mt-1 text-sm text-muted-foreground">
          This usually takes a few minutes. You can leave this page; the meeting will be ready on your dashboard.
        </p>
      )}

      <div className="mt-5 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span aria-live="polite">{failed ? "Stopped" : STAGES[Math.min(current, STAGES.length - 1)].label}</span>
          <span className="tabular-nums text-muted-foreground">{Math.round(status.progress_pct)}%</span>
        </div>
        <ProgressBar value={status.progress_pct} label="Processing progress" />
      </div>

      <ol className="mt-6 space-y-3" aria-label="Processing stages">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current && !failed;
          const errored = i === current && failed;
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  errored && "border-destructive text-destructive",
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : active ? (
                  <Spinner className="size-3" />
                ) : errored ? (
                  <CircleAlert className="size-3.5" />
                ) : null}
              </span>
              <span className={cn(!done && !active && "text-muted-foreground", active && "font-medium")}>
                {s.label}
                <span className="sr-only">
                  {done ? " (done)" : active ? " (in progress)" : errored ? " (failed)" : " (waiting)"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="mt-5 space-y-3">
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? <Spinner /> : <RefreshCw />} Retry from last completed step
          </Button>
        </div>
      )}
    </Card>
  );
}

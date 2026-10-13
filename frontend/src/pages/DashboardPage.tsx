import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock,
  FileAudio,
  Gavel,
  ListTodo,
  Mic,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Buddy, moodFor, useAnnouncedMood, type Mood } from "@/components/Buddy";
import { DueSoonPanel, SeriesPanel } from "@/components/DashboardPanels";
import { DeleteMeetingDialog } from "@/components/DeleteMeetingDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, Card, ProgressBar, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MeetingListItem, MeetingStatusValue } from "@/lib/types";
import { cn, formatDate, formatDuration } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting to start",
  preprocessing: "Preparing audio",
  transcribing: "Transcribing",
  diarizing: "Identifying speakers",
  aligning: "Building the transcript",
  summarizing: "Writing the minutes",
  verifying: "Checking evidence",
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function hours(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

// What Mindy says on the dashboard banner.
const BANNER_LINES: Record<Mood, string> = {
  idle: "Ready when you are!",
  listening: "Listening to your meeting…",
  thinking: "Getting things ready…",
  writing: "Writing your minutes…",
  checking: "Checking the evidence…",
  celebrating: "Your meeting is ready!",
  sad: "That one failed. Try Retry?",
};

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint: string;
  tone: string;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-md">
      <div
        className={cn(
          "absolute -right-6 -top-6 size-24 rounded-full opacity-15 blur-2xl transition-opacity group-hover:opacity-30",
          tone,
        )}
        aria-hidden
      />
      <div
        className={cn("flex size-10 items-center justify-center rounded-xl text-white shadow-sm [&_svg]:size-5", tone)}
      >
        {icon}
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

type Filter = "all" | "completed" | "processing" | "failed";

const FILTERS: { id: Filter; label: string; match: (s: MeetingStatusValue) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "completed", label: "Ready", match: (s) => s === "completed" },
  { id: "processing", label: "Processing", match: (s) => s === "processing" || s === "queued" },
  { id: "failed", label: "Failed", match: (s) => s === "failed" },
];

const ACCENT: Record<MeetingStatusValue, string> = {
  completed: "from-emerald-500 to-teal-500",
  processing: "from-orange-500 via-rose-500 to-fuchsia-500",
  queued: "from-amber-400 to-orange-500",
  failed: "from-red-600 to-rose-600",
};

function Chip({ icon, children, warn }: { icon: ReactNode; children: ReactNode; warn?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5",
        warn ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function MeetingCard({ m, onDelete }: { m: MeetingListItem; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retry(m.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });
  const busy = m.status === "processing" || m.status === "queued";

  return (
    <li>
      <Card className="group relative flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
        <div className={cn("h-1.5 bg-gradient-to-r", ACCENT[m.status])} aria-hidden />
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={`/meetings/${m.id}`}
                className="line-clamp-2 font-semibold leading-snug underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {m.title}
              </Link>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{formatDate(m.created_at)}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Timer className="size-3" aria-hidden /> {formatDuration(m.duration_s)}
                </span>
                {m.source === "browser" && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Mic className="size-3" aria-hidden /> Recorded
                    </span>
                  </>
                )}
              </p>
            </div>
            <StatusBadge status={m.status} />
          </div>

          {m.status === "completed" && (
            <>
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                {m.overview || "Transcript and minutes are ready to review."}
              </p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                {m.speaker_count > 0 && (
                  <Chip icon={<Users />}>
                    {m.speaker_count} speaker{m.speaker_count === 1 ? "" : "s"}
                  </Chip>
                )}
                <Chip icon={<Gavel />}>
                  {m.decision_count} decision{m.decision_count === 1 ? "" : "s"}
                </Chip>
                <Chip icon={<ListTodo />}>{m.open_action_count} open actions</Chip>
                {m.flagged_count > 0 && (
                  <Chip icon={<ShieldAlert />} warn>
                    {m.flagged_count} to review
                  </Chip>
                )}
              </div>
            </>
          )}

          {busy && (
            <div className="mt-auto space-y-2 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Spinner className="size-3" /> {STAGE_LABELS[m.stage ?? "queued"] ?? "Processing"}
                </span>
                <span className="tabular-nums text-muted-foreground">{Math.round(m.progress_pct)}%</span>
              </div>
              <ProgressBar value={m.progress_pct} label={`Progress for ${m.title}`} />
            </div>
          )}

          {m.status === "failed" && (
            <div className="relative z-10 mt-auto flex items-center justify-between gap-2 pt-4">
              <span className="text-xs text-destructive">Processing stopped.</span>
              <Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
                {retry.isPending ? <Spinner /> : <RotateCcw />} Retry
              </Button>
            </div>
          )}
        </div>
        <div className="relative z-10 flex items-center justify-between border-t px-5 py-2 text-xs text-muted-foreground">
          <span>{m.source === "browser" ? "Recorded in MeetCite" : "Uploaded"}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-70 hover:opacity-100"
            aria-label={`Delete ${m.title}`}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </Card>
    </li>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const query = useDebounced(search.trim(), 300);
  const [toDelete, setToDelete] = useState<MeetingListItem | null>(null);

  const meetings = useQuery({
    queryKey: ["meetings", query],
    queryFn: () => api.listMeetings(query || undefined),
    // Keep statuses fresh while anything is still being processed.
    refetchInterval: (q) =>
      q.state.data?.some((m) => m.status === "queued" || m.status === "processing") ? 3000 : false,
  });

  const all = useMemo(() => meetings.data ?? [], [meetings.data]);
  const stats = useMemo(() => {
    const ready = all.filter((m) => m.status === "completed");
    return {
      total: all.length,
      audio: ready.reduce((sum, m) => sum + (m.duration_s ?? 0), 0),
      openActions: ready.reduce((sum, m) => sum + m.open_action_count, 0),
      flagged: ready.reduce((sum, m) => sum + m.flagged_count, 0),
      busy: all.filter((m) => m.status === "processing" || m.status === "queued").length,
    };
  }, [all]);
  const shown = all.filter((m) => FILTERS.find((f) => f.id === filter)!.match(m.status));
  const working = all.find((m) => m.status === "processing" || m.status === "queued");
  const buddyMood = useAnnouncedMood(working ? moodFor(working.status, working.stage) : "idle");
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-700 via-rose-700 to-fuchsia-800 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-20 size-72 rounded-full bg-amber-300/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 left-1/3 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white/85">{greeting()}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {firstName ? `${firstName}, your meetings` : "Your meetings"}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/90">
              {stats.busy > 0
                ? `${stats.busy} meeting${stats.busy === 1 ? " is" : "s are"} being processed. You'll hear a chime when it's ready.`
                : "Upload or record a meeting and get a transcript, minutes and evidence-checked decisions."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="bg-white text-rose-800 shadow hover:bg-white/90">
                <Link to="/upload">
                  <Plus /> Upload a meeting
                </Link>
              </Button>
              {/* Solid dark button so it stands out on the bright banner; the red dot gets a white ring. */}
              <Button
                asChild
                className="border border-white/25 bg-[#2a0e2e] text-white shadow hover:bg-[#3b1240] focus-visible:ring-white"
              >
                <Link to="/record">
                  <Circle className="fill-red-500 text-white" strokeWidth={3} /> Record
                </Link>
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-center md:pr-4">
            <Buddy mood={buddyMood} size={150} className="drop-shadow-[0_0_22px_rgba(255,255,255,0.45)]" />
            <p className="-mt-1 text-xs font-medium text-white/85" aria-live="polite">
              {BANNER_LINES[buddyMood]}
            </p>
          </div>
        </div>
      </section>

      {/* At a glance */}
      <section aria-label="At a glance" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<FileAudio />}
          label="Meetings"
          value={stats.total}
          hint={stats.busy ? `${stats.busy} processing now` : "in your library"}
          tone="bg-gradient-to-br from-orange-500 to-rose-500"
        />
        <StatCard
          icon={<AudioLines />}
          label="Audio transcribed"
          value={hours(stats.audio)}
          hint="across ready meetings"
          tone="bg-gradient-to-br from-fuchsia-500 to-purple-600"
        />
        <StatCard
          icon={<ListTodo />}
          label="Open actions"
          value={stats.openActions}
          hint="still to be done"
          tone="bg-gradient-to-br from-amber-500 to-orange-600"
        />
        <StatCard
          icon={<ShieldAlert />}
          label="Claims to review"
          value={stats.flagged}
          hint="flagged by the evidence check"
          tone="bg-gradient-to-br from-rose-500 to-red-600"
        />
      </section>

      {/* Project memory and deadlines */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <SeriesPanel />
        <DueSoonPanel />
      </div>

      {/* Library */}
      <section aria-labelledby="library" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="library" className="text-xl font-semibold tracking-tight">
            Library
          </h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => {
              const count = all.filter((m) => f.match(m.status)).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    filter === f.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label} <span className="tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search titles and transcripts…"
            aria-label="Search meetings"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {meetings.isLoading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Spinner /> Loading meetings…
          </p>
        )}
        {meetings.isError && <Alert variant="destructive">{(meetings.error as Error).message}</Alert>}

        {meetings.data && all.length === 0 && (
          <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 text-white shadow-lg">
              <FileAudio className="size-8" aria-hidden />
            </div>
            {query ? (
              <p className="text-muted-foreground">No meetings match “{query}”.</p>
            ) : (
              <>
                <p className="text-lg font-semibold">No meetings yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Upload an MP3, WAV, M4A, MP4 or WEBM recording of up to two hours. MeetCite will transcribe it,
                  identify speakers and write evidence-linked minutes.
                </p>
                <Button asChild className="mt-2">
                  <Link to="/upload">Upload a recording</Link>
                </Button>
              </>
            )}
          </Card>
        )}

        {all.length > 0 && shown.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {filter === "failed" ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
            Nothing here right now.
          </p>
        )}

        {shown.length > 0 && (
          <ul aria-label="Meetings" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((m) => (
              <MeetingCard key={m.id} m={m} onDelete={() => setToDelete(m)} />
            ))}
          </ul>
        )}
        {all.some((m) => m.status === "failed") && filter !== "failed" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleAlert className="size-3.5" /> Failed meetings can be retried from their card.
          </p>
        )}
      </section>

      <DeleteMeetingDialog meeting={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

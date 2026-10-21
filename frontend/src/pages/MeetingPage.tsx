import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckSquare,
  Download,
  FileText,
  Gavel,
  Layers,
  ListChecks,
  BarChart3,
  Columns2,
  CircleHelp,
  MessageCircleQuestion,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AudioPlayer, type AudioPlayerHandle } from "@/components/AudioPlayer";
import { BuddyWithMessage } from "@/components/Buddy";
import { DeleteMeetingDialog } from "@/components/DeleteMeetingDialog";
import { ActionItemsTab } from "@/components/meeting/ActionItemsTab";
import { AskTab } from "@/components/meeting/AskTab";
import { CompareTab } from "@/components/meeting/CompareTab";
import { ReviewProvider } from "@/components/meeting/reviews";
import { InsightsTab } from "@/components/meeting/InsightsTab";
import { QuestionsRisksTab } from "@/components/meeting/QuestionsRisksTab";
import { DecisionsTab } from "@/components/meeting/DecisionsTab";
import { EvidenceTab } from "@/components/meeting/EvidenceTab";
import { FollowUpTab } from "@/components/meeting/FollowUpTab";
import { MemoryTab } from "@/components/meeting/MemoryTab";
import { SummaryTab } from "@/components/meeting/SummaryTab";
import { TranscriptTab, type Highlight } from "@/components/meeting/TranscriptTab";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, Card, ProgressBar, Spinner } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, downloadExport } from "@/lib/api";
import type { MeetingDetail, MeetingStatus } from "@/lib/types";
import { useProgress } from "@/lib/useProgress";
import { formatDate, formatDuration, friendlyModel } from "@/lib/utils";

function statusFromMeeting(m: MeetingDetail): MeetingStatus {
  return {
    meeting_id: m.id,
    status: m.status,
    stage: m.job?.stage ?? "queued",
    progress_pct: m.job?.progress_pct ?? 0,
    error: m.job?.error ?? null,
    warnings: m.job?.warnings ?? [],
  };
}

function TitleEditor({ meeting }: { meeting: MeetingDetail }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (title: string) => api.updateMeeting(meeting.id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setDraft(null);
    },
  });
  if (draft !== null) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) save.mutate(draft.trim());
        }}
      >
        <Input
          autoFocus
          aria-label="Meeting title"
          className="h-10 max-w-md text-lg font-semibold"
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        />
        <Button type="submit" size="sm" disabled={save.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
      <Button variant="ghost" size="icon" aria-label="Rename meeting" onClick={() => setDraft(meeting.title)}>
        <Pencil />
      </Button>
    </div>
  );
}

function ExportMenu({ meetingId }: { meetingId: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const run = async (format: "pdf" | "docx" | "txt") => {
    setBusy(format);
    setError(undefined);
    try {
      await downloadExport(meetingId, format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Export minutes">
      <span className="mr-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Download className="size-4" aria-hidden /> Export
      </span>
      {(["pdf", "docx", "txt"] as const).map((f) => (
        <Button key={f} variant="outline" size="sm" onClick={() => run(f)} disabled={busy !== null}>
          {busy === f && <Spinner />} {f.toUpperCase()}
        </Button>
      ))}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

export default function MeetingPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playerRef = useRef<AudioPlayerHandle>(null);
  const [tab, setTab] = useState("summary");
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const meetingQuery = useQuery({ queryKey: ["meeting", id], queryFn: () => api.getMeeting(id), enabled: !!id });
  const meeting = meetingQuery.data;
  const busy = meeting?.status === "queued" || meeting?.status === "processing";
  const live = useProgress(id, busy);
  const hasTranscript = (meeting?.segments.length ?? 0) > 0;
  const media = useQuery({
    queryKey: ["media", id],
    queryFn: () => api.media(id),
    enabled: hasTranscript,
    staleTime: 60 * 60 * 1000, // the audio URL token lasts six hours
  });

  // When the job finishes, reload the meeting to show the results.
  useEffect(() => {
    if (live && (live.status === "completed" || live.status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    }
  }, [live, id, queryClient]);

  const retry = useMutation({
    mutationFn: () => api.retry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting", id] }),
  });

  const segmentsByPosition = useMemo(
    () => new Map((meeting?.segments ?? []).map((s) => [s.position, s])),
    [meeting?.segments],
  );

  const onJump = useCallback(
    (ids: number[]) => {
      if (!ids.length) return;
      setTab("transcript");
      setHighlight({ ids, nonce: Date.now() });
      const seg = segmentsByPosition.get(ids[0]);
      if (seg) playerRef.current?.seekTo(seg.start_s, false);
    },
    [segmentsByPosition],
  );
  const onPlay = useCallback((seconds: number) => playerRef.current?.seekTo(seconds, true), []);

  // Links from other meetings (?at=<line>) open the transcript at that moment;
  // links from the dashboard (?tab=evidence, ?tab=actions…) open the tab that needs attention.
  const [params, setParams] = useSearchParams();
  const at = params.get("at");
  const tabParam = params.get("tab");
  useEffect(() => {
    if (!tabParam) return;
    setTab(tabParam);
    setParams({}, { replace: true });
  }, [tabParam, setParams]);
  useEffect(() => {
    if (at === null || segmentsByPosition.size === 0) return;
    onJump([Number(at)]);
    setParams({}, { replace: true });
  }, [at, segmentsByPosition, onJump, setParams]);

  if (meetingQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading meeting…
      </p>
    );
  }
  if (meetingQuery.isError || !meeting) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">{(meetingQuery.error as Error)?.message ?? "Meeting not found."}</Alert>
        <Button asChild variant="outline">
          <Link to="/">Back to meetings</Link>
        </Button>
      </div>
    );
  }

  const status = (busy && live) || statusFromMeeting(meeting);
  const tabProps = { meeting, segmentsByPosition, onJump };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All meetings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <TitleEditor meeting={meeting} />
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{formatDate(meeting.created_at)}</span>·<span>{formatDuration(meeting.duration_s)}</span>·
            <span>{meeting.original_filename}</span>
            <StatusBadge status={status.status} />
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)} className="text-destructive">
          <Trash2 /> Delete
        </Button>
      </div>

      {!hasTranscript ? (
        <ProcessingPanel status={status} onRetry={() => retry.mutate()} retrying={retry.isPending} />
      ) : (
        <>
          {busy && (
            <Card className="space-y-2 p-4">
              <p className="text-sm font-medium" aria-live="polite">
                Re-summarizing… {Math.round(status.progress_pct)}%
              </p>
              <ProgressBar value={status.progress_pct} label="Re-summarizing progress" />
            </Card>
          )}
          {/* Mindy delivers failures and warnings, with Retry right next to her. */}
          {meeting.status === "failed" && meeting.job?.error ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <BuddyWithMessage mood="sad" message={meeting.job.error} variant="error" size={72} />
              <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
                {retry.isPending ? <Spinner /> : <RefreshCw />} Retry
              </Button>
            </Card>
          ) : (
            !!meeting.job?.warnings.length && (
              <BuddyWithMessage mood="thinking" message={meeting.job.warnings.join(" ")} variant="warning" size={72} />
            )
          )}

          <Card className="p-4">
            {media.data ? (
              <AudioPlayer ref={playerRef} media={media.data} onTime={setCurrentTime} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading audio…
              </p>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ExportMenu meetingId={meeting.id} />
          </div>

          {/* Short AI-generated label (the spec's ethics requirement), with a shortcut to the flagged claims. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/50 px-4 py-2.5 text-sm">
            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <strong>AI-generated</strong>
              {meeting.summary ? ` by ${friendlyModel(meeting.summary.model_used)}` : ""}.{" "}
              {meeting.summary?.configuration === "baseline"
                ? "This baseline version cites no evidence, so its claims can't be checked."
                : "Check before sharing."}
            </span>
            {meeting.review_needed_count > 0 && (
              <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setTab("evidence")}>
                <ShieldCheck /> Review {meeting.review_needed_count} flagged
              </Button>
            )}
          </div>

          <ReviewProvider meeting={meeting}>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="max-w-full">
                <TabsTrigger value="summary">
                  <FileText className="size-4" aria-hidden /> Summary
                </TabsTrigger>
                <TabsTrigger value="actions">
                  <CheckSquare className="size-4" aria-hidden /> Action items ({meeting.action_items.length})
                </TabsTrigger>
                <TabsTrigger value="decisions">
                  <Gavel className="size-4" aria-hidden /> Decisions ({meeting.decisions.length})
                </TabsTrigger>
                <TabsTrigger value="questions">
                  <CircleHelp className="size-4" aria-hidden />
                  {`Questions & risks (${(meeting.summary?.open_questions.length ?? 0) + (meeting.summary?.risks.length ?? 0)})`}
                </TabsTrigger>
                <TabsTrigger value="evidence">
                  <ShieldCheck className="size-4" aria-hidden /> Evidence review
                </TabsTrigger>
                <TabsTrigger value="followup">
                  <Send className="size-4" aria-hidden /> Follow-up
                </TabsTrigger>
                <TabsTrigger value="memory">
                  <Layers className="size-4" aria-hidden /> Series memory
                </TabsTrigger>
                <TabsTrigger value="transcript">
                  <ListChecks className="size-4" aria-hidden /> Transcript
                </TabsTrigger>
                <TabsTrigger value="compare">
                  <Columns2 className="size-4" aria-hidden /> Compare ({meeting.summaries.length})
                </TabsTrigger>
                <TabsTrigger value="insights">
                  <BarChart3 className="size-4" aria-hidden /> Insights
                </TabsTrigger>
                <TabsTrigger value="ask">
                  <MessageCircleQuestion className="size-4" aria-hidden /> Ask
                </TabsTrigger>
              </TabsList>
              <TabsContent value="summary">
                <SummaryTab {...tabProps} />
              </TabsContent>
              <TabsContent value="actions">
                <ActionItemsTab {...tabProps} />
              </TabsContent>
              <TabsContent value="decisions">
                <DecisionsTab {...tabProps} />
              </TabsContent>
              <TabsContent value="questions">
                <QuestionsRisksTab {...tabProps} />
              </TabsContent>
              <TabsContent value="evidence">
                <EvidenceTab {...tabProps} />
              </TabsContent>
              <TabsContent value="followup">
                <FollowUpTab {...tabProps} />
              </TabsContent>
              <TabsContent value="memory">
                <MemoryTab {...tabProps} />
              </TabsContent>
              <TabsContent value="transcript">
                <TranscriptTab {...tabProps} highlight={highlight} currentTime={currentTime} onPlay={onPlay} />
              </TabsContent>
              <TabsContent value="compare">
                <CompareTab {...tabProps} />
              </TabsContent>
              <TabsContent value="insights">
                <InsightsTab {...tabProps} />
              </TabsContent>
              <TabsContent value="ask">
                <AskTab {...tabProps} />
              </TabsContent>
            </Tabs>
          </ReviewProvider>
        </>
      )}

      <DeleteMeetingDialog
        meeting={deleting ? meeting : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate("/")}
      />
    </div>
  );
}

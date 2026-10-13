import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, Mic, MonitorSpeaker, Square, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BuddyWithMessage, type BubbleVariant, type Mood } from "@/components/Buddy";
import { LiveCaptions } from "@/components/LiveCaptions";
import { SeriesSelect } from "@/components/SeriesSelect";
import { Button } from "@/components/ui/button";
import { PrivacyNote } from "@/components/PrivacyNote";
import { Input, Label } from "@/components/ui/form";
import { Card, ProgressBar, Spinner } from "@/components/ui/misc";
import { api, uploadMeeting } from "@/lib/api";
import { useLiveCaptions } from "@/lib/useLiveCaptions";
import { recordingSupported, RecorderError, useRecorder } from "@/lib/useRecorder";
import { formatTimestamp } from "@/lib/utils";

/**
 * Record a Teams, Zoom or Meet call from the browser (FR15, US2).
 * Covert recording is out of scope: recording cannot start until the user confirms that everyone
 * has been told and agrees, and a recording indicator stays visible the whole time.
 */
export default function RecordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const support = useMemo(recordingSupported, []);
  const live = useLiveCaptions();
  const [liveOn, setLiveOn] = useState(true);
  const liveEnabled = Boolean(config.data?.live_available) && liveOn;
  const recorder = useRecorder(config.data?.max_duration_s ?? 7200, liveEnabled ? live.sendAudio : undefined);

  const [consent, setConsent] = useState(false);
  const [callAudio, setCallAudio] = useState(support.callAudio);
  const [microphone, setMicrophone] = useState(true);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);
  const [seriesId, setSeriesId] = useState<number | null>(null);
  const recording = recorder.state === "recording";

  // Mindy reacts to the recording; "quiet" only after 3 s without sound, so pauses don't flicker.
  const lastSound = useRef(0);
  if (recorder.level > 0.03) lastSound.current = Date.now();
  const quiet = recording && recorder.elapsed > 2 && Date.now() - lastSound.current > 3000;
  // Mindy delivers problems first: an error, a recorder warning, or an unsupported browser.
  const buddy: { mood: Mood; message: string; variant?: BubbleVariant } = error
    ? { mood: "sad", message: error, variant: "error" }
    : recorder.warning
      ? { mood: "thinking", message: recorder.warning, variant: "warning" }
      : recording && live.status === "error"
        ? {
            mood: "thinking",
            message: `${live.error ?? "Live captions stopped."} I'm still recording.`,
            variant: "warning",
          }
        : !support.ok
          ? { mood: "sad", message: support.reason ?? "This browser cannot record audio.", variant: "error" }
          : progress !== null
            ? { mood: "writing", message: "Uploading… I'll take it from here!" }
            : recorder.state === "stopped"
              ? { mood: "celebrating", message: "Got it! Upload it when you're ready." }
              : recording
                ? quiet
                  ? { mood: "thinking", message: "It's very quiet… is the meeting audio shared?" }
                  : { mood: "listening", message: "I'm listening… keep talking!" }
                : recorder.state === "starting"
                  ? { mood: "thinking", message: "Choose what to share and I'll start listening." }
                  : { mood: "idle", message: consent ? "Ready when you are!" : "Tick the consent box to begin." };

  // A visible indicator in the browser tab too, and a warning before leaving mid-recording.
  useEffect(() => {
    if (!recording) return;
    const previous = document.title;
    document.title = `● REC ${formatTimestamp(recorder.elapsed)} · MeetMind`;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      document.title = previous;
      window.removeEventListener("beforeunload", warn);
    };
  }, [recording, recorder.elapsed]);

  // Live captions end with the recording.
  const { stop: stopLive } = live;
  useEffect(() => {
    if (recorder.state === "stopped") stopLive();
  }, [recorder.state, stopLive]);

  const previewUrl = useMemo(() => (recorder.blob ? URL.createObjectURL(recorder.blob) : null), [recorder.blob]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  async function start() {
    setError(undefined);
    try {
      await recorder.start({ callAudio, microphone });
      // Connect only once recording has really started, so a refused permission costs nothing.
      if (liveEnabled) void live.start();
    } catch (e) {
      setError(e instanceof RecorderError ? e.message : String(e));
    }
  }

  async function uploadRecording() {
    if (!recorder.blob) return;
    setError(undefined);
    setProgress(0);
    const name = (title.trim() || `Recording ${new Date().toLocaleString()}`).slice(0, 200);
    const file = new File([recorder.blob], `${name.replace(/[^\w\- ]+/g, "_")}.webm`, { type: "audio/webm" });
    try {
      const meeting = await uploadMeeting(
        { file, title: name, model: config.data?.default_summarizer ?? "llm", source: "browser", seriesId },
        setProgress,
      );
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      navigate(`/meetings/${meeting.id}`);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Record a meeting</h1>
          <p className="text-sm text-muted-foreground">
            Capture a Teams, Zoom or Google Meet call running on this computer, without installing anything.
          </p>
        </div>
        <BuddyWithMessage
          mood={buddy.mood}
          message={buddy.message}
          variant={buddy.variant}
          level={recorder.level}
          size={96}
        />
      </div>

      {recorder.state === "idle" || recorder.state === "starting" ? (
        <Card className="space-y-5 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="rec-title">Meeting title</Label>
            <Input
              id="rec-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly team meeting"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What to record</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={callAudio}
                disabled={!support.callAudio}
                onChange={(e) => setCallAudio(e.target.checked)}
              />
              <span>
                <MonitorSpeaker className="mr-1 inline size-4" aria-hidden />
                <strong>Other participants</strong>: you will be asked to share the meeting tab or your screen. Turn on{" "}
                <em>"Share tab audio"</em> or <em>"Share system audio"</em>.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={microphone}
                onChange={(e) => setMicrophone(e.target.checked)}
              />
              <span>
                <Mic className="mr-1 inline size-4" aria-hidden />
                <strong>My microphone</strong>: your own voice.
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Works best in Chrome or Edge on Windows, which can share system audio. Other browsers may only share a
              tab's audio, or none. Use headphones to avoid echo.
            </p>
          </fieldset>

          {config.data?.live_available && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={liveOn}
                onChange={(e) => setLiveOn(e.target.checked)}
              />
              <span>
                <strong>Live captions and quick notes</strong>: see what is said as it happens. While recording, the
                audio is streamed to AssemblyAI to make the captions.
              </span>
            </label>
          )}

          <label className="flex items-start gap-3 rounded-md border border-primary/40 bg-accent/40 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-describedby="consent-help"
            />
            <span>
              <strong>Everyone in this meeting has been told it is being recorded and has agreed.</strong>
              <span id="consent-help" className="mt-1 block text-muted-foreground">
                Recording people without their knowledge may be unlawful. Your organisation's policies and the meeting
                platform's terms may also apply. The recording is stored only in your account and you can delete it at
                any time.
              </span>
            </span>
          </label>

          <Button
            size="lg"
            onClick={start}
            disabled={!support.ok || !consent || (!callAudio && !microphone) || recorder.state === "starting"}
          >
            {recorder.state === "starting" ? <Spinner /> : <Circle className="fill-current" />} Start recording
          </Button>
          {!consent && <p className="text-sm text-muted-foreground">Tick the confirmation above to start.</p>}
        </Card>
      ) : null}

      {recording && (
        <Card className="space-y-4 border-red-500 p-5" role="status" aria-live="polite">
          <p className="flex items-center gap-3 text-xl font-semibold text-red-600 dark:text-red-400">
            <span className="relative flex size-4">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex size-4 rounded-full bg-red-600" />
            </span>
            Recording · <span className="tabular-nums">{formatTimestamp(recorder.elapsed)}</span>
          </p>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Sound level</p>
            <ProgressBar value={Math.min(100, recorder.level * 140)} label="Sound level" />
          </div>
          <p className="text-sm text-muted-foreground">
            Keep this tab open. Recording stops when you press Stop or stop sharing.
          </p>
          <Button variant="destructive" size="lg" onClick={recorder.stop}>
            <Square className="fill-current" /> Stop recording
          </Button>
        </Card>
      )}

      {liveEnabled && (recording || (recorder.state === "stopped" && live.turns.length > 0)) && (
        <LiveCaptions status={live.status} turns={live.turns} />
      )}

      {recorder.state === "stopped" && recorder.blob && (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">
            Recording finished · {formatTimestamp(recorder.elapsed)} · {(recorder.blob.size / 1024 / 1024).toFixed(1)}{" "}
            MB
          </h2>
          {previewUrl && <audio controls src={previewUrl} className="w-full" aria-label="Listen to the recording" />}
          <div className="space-y-1.5">
            <Label htmlFor="rec-series">Meeting series (optional)</Label>
            <SeriesSelect id="rec-series" value={seriesId} onChange={setSeriesId} disabled={progress !== null} />
          </div>
          {progress !== null && <ProgressBar value={progress * 100} label="Upload progress" />}
          <div className="flex flex-wrap gap-2">
            <Button onClick={uploadRecording} disabled={progress !== null}>
              {progress !== null ? <Spinner /> : <UploadCloud />} Upload and process
            </Button>
            <Button variant="ghost" onClick={recorder.reset} disabled={progress !== null}>
              <Trash2 /> Discard
            </Button>
          </div>
          <PrivacyNote />
        </Card>
      )}
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BuddyWithMessage, type BubbleVariant, type Mood } from "@/components/Buddy";
import { PrivacyNote } from "@/components/PrivacyNote";
import { SeriesSelect } from "@/components/SeriesSelect";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { ProgressBar, Spinner } from "@/components/ui/misc";
import { api, uploadMeeting } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACCEPTED = [".mp3", ".wav", ".m4a", ".mp4", ".webm"];

function titleFromFile(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export default function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [namesFile, setNamesFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  // A series can be pre-selected from its page ("Add a meeting" -> /upload?series=3).
  const [params] = useSearchParams();
  const [seriesId, setSeriesId] = useState<number | null>(params.get("series") ? Number(params.get("series")) : null);
  const [agenda, setAgenda] = useState("");

  const maxMb = config.data?.max_upload_mb ?? 1024;
  // Always the evidence-grounded configuration; the plain one (C1) is generated from the Compare tab.
  const chosenModel = config.data?.default_summarizer ?? "llm";

  function pick(f: File | undefined) {
    setError(undefined);
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError(`That file type isn't supported. Use ${ACCEPTED.join(", ")}.`);
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setError(`That file is larger than the ${maxMb} MB limit.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(titleFromFile(f.name));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a recording to upload.");
      return;
    }
    setError(undefined);
    setProgress(0);
    try {
      const meeting = await uploadMeeting(
        { file, title: title.trim(), model: chosenModel, namesFile, seriesId, agenda },
        setProgress,
      );
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  }

  const uploading = progress !== null;
  // Mindy delivers the page's messages, errors included.
  const buddy: { mood: Mood; message: string; variant?: BubbleVariant } = error
    ? { mood: "sad", message: error, variant: "error" }
    : uploading
      ? { mood: "writing", message: `Uploading… ${Math.round((progress ?? 0) * 100)}%. Nearly there!` }
      : file
        ? { mood: "idle", message: "Got it! Check the title, then press Upload and process." }
        : { mood: "idle", message: "Drop a recording here and I'll take care of the rest." };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New meeting</h1>
          <p className="text-sm text-muted-foreground">
            Upload a recording in English, up to two hours long. You can leave this page while it is processed.
          </p>
        </div>
        <BuddyWithMessage mood={buddy.mood} message={buddy.message} variant={buddy.variant} size={96} />
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-primary bg-accent/40" : "border-input bg-card",
          )}
        >
          {file ? (
            <div className="flex w-full max-w-md items-center gap-3 rounded-md bg-muted px-3 py-2 text-left">
              <FileAudio className="size-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              {!uploading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove file"
                  onClick={() => setFile(null)}
                >
                  <X />
                </Button>
              )}
            </div>
          ) : (
            <>
              <UploadCloud className="size-10 text-muted-foreground" aria-hidden />
              <p className="font-medium">Drag and drop a recording here</p>
              <p className="text-sm text-muted-foreground">MP3, WAV, M4A, MP4 or WEBM · up to {maxMb} MB</p>
            </>
          )}
          <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {file ? "Choose a different file" : "Choose a file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Meeting title</Label>
          <Input
            id="title"
            value={title}
            maxLength={200}
            placeholder="e.g. Weekly project sync"
            onChange={(e) => setTitle(e.target.value)}
            disabled={uploading}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="series">Meeting series (optional)</Label>
            <SeriesSelect id="series" value={seriesId} onChange={setSeriesId} disabled={uploading} />
            <p className="text-xs text-muted-foreground">
              Part of a recurring meeting? MeetMind carries open actions over and spots changed decisions.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agenda">Agenda (optional)</Label>
            <Textarea
              id="agenda"
              rows={3}
              value={agenda}
              maxLength={5000}
              placeholder={"One item per line, e.g.\nLaunch date\nBudget"}
              onChange={(e) => setAgenda(e.target.value)}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">You'll see what was covered, skipped or added.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="names-file">Speaker names from Teams or Zoom (optional)</Label>
          <Input
            id="names-file"
            type="file"
            accept=".vtt"
            disabled={uploading}
            aria-describedby="names-help"
            className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
            onChange={(e) => setNamesFile(e.target.files?.[0] ?? null)}
          />
          <p id="names-help" className="text-sm text-muted-foreground">
            Attach the meeting's transcript file (.vtt) to label every line with the speaker's real name. In Teams, open
            the meeting's <em>Recap</em> tab, then <em>Transcript</em> and <em>Download as .vtt</em>. In Zoom, download
            the audio transcript from the cloud recording. Without it, speakers are labelled Speaker 1, Speaker 2…
          </p>
        </div>

        {uploading && (
          <div className="space-y-1.5">
            <p className="text-sm" aria-live="polite">
              Uploading… {Math.round((progress ?? 0) * 100)}%
            </p>
            <ProgressBar value={(progress ?? 0) * 100} label="Upload progress" />
          </div>
        )}

        <Button type="submit" size="lg" disabled={uploading || !file} className="w-full sm:w-auto">
          {uploading && <Spinner />} Upload and process
        </Button>
        <PrivacyNote />
      </form>
    </div>
  );
}

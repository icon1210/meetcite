import { Check, Pencil, Search, Sparkles, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { Segment, Speaker } from "@/lib/types";
import { cn, formatTimestamp, speakerColour } from "@/lib/utils";
import { useMeetingMutation, type TabProps } from "./shared";

export interface Highlight {
  ids: number[];
  nonce: number; // changes on every click, so clicking the same source again re-scrolls
}

function highlightMatches(text: string, query: string): ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-warning px-0.5 text-warning-foreground">
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

function SpeakerChip({ speaker, index, meetingId }: { speaker: Speaker; index: number; meetingId: number }) {
  const [name, setName] = useState<string | null>(null);
  const rename = useMeetingMutation(meetingId, (n: string) => api.renameSpeaker(speaker.id, n));
  const colour = speakerColour(index).chip;

  if (name !== null) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) rename.mutate(name.trim(), { onSuccess: () => setName(null) });
        }}
      >
        <Input
          autoFocus
          aria-label={`New name for ${speaker.display_name}`}
          className="h-8 w-40"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setName(null)}
        />
        <Button type="submit" size="icon" variant="ghost" aria-label="Save name" disabled={rename.isPending}>
          {rename.isPending ? <Spinner /> : <Check />}
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setName(null)}>
          <X />
        </Button>
      </form>
    );
  }
  const suggestion = speaker.suggested_name;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setName(speaker.display_name)}
        className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", colour)}
        aria-label={`Rename ${speaker.display_name}`}
        title={speaker.suggestion_reason ?? undefined}
      >
        {speaker.display_name}
        <Pencil className="size-3" aria-hidden />
      </button>
      {suggestion && suggestion !== speaker.display_name && (
        // A name MeetMind found in the conversation. It is never applied without the user's say-so.
        <button
          type="button"
          onClick={() => rename.mutate(suggestion)}
          disabled={rename.isPending}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary px-2 py-0.5 text-xs text-primary hover:bg-accent"
          title={speaker.suggestion_reason ?? undefined}
          aria-label={`Use the suggested name ${suggestion} for ${speaker.display_name}. ${speaker.suggestion_reason ?? ""}`}
        >
          <Sparkles className="size-3" aria-hidden /> {suggestion}?
        </button>
      )}
    </span>
  );
}

const SegmentRow = memo(function SegmentRow({
  segment,
  speaker,
  speakerIndex,
  query,
  active,
  highlighted,
  highlightNonce,
  meetingId,
  onPlay,
}: {
  segment: Segment;
  speaker: Speaker | undefined;
  speakerIndex: number;
  query: string;
  active: boolean;
  highlighted: boolean;
  highlightNonce: number;
  meetingId: number;
  onPlay: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMeetingMutation(meetingId, (text: string) => api.editSegment(segment.id, { text }));
  const revert = useMeetingMutation(meetingId, () => api.editSegment(segment.id, { revert: true }));
  const colour = speakerColour(speakerIndex);

  return (
    <li
      id={`segment-${segment.position}`}
      // The key change restarts the flash animation each time a source link is clicked.
      key={highlighted ? `h${highlightNonce}` : undefined}
      className={cn(
        "group flex gap-3 rounded-md border-l-4 px-3 py-2 scroll-mt-28",
        colour.border,
        active && "bg-muted",
        highlighted && "animate-flash ring-2 ring-ring",
      )}
    >
      <button
        type="button"
        onClick={() => onPlay(segment.start_s)}
        className="h-fit shrink-0 rounded px-1 font-mono text-xs tabular-nums text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={`Play from ${formatTimestamp(segment.start_s)}`}
      >
        {formatTimestamp(segment.start_s)}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{speaker?.display_name ?? "Unknown speaker"}</p>
        {draft !== null ? (
          <form
            className="mt-1 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) save.mutate(draft.trim(), { onSuccess: () => setDraft(null) });
            }}
          >
            <Textarea aria-label="Corrected transcript text" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending && <Spinner />} Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="leading-relaxed">{highlightMatches(segment.text, query)}</p>
            {segment.original_text !== null && (
              // Corrections never overwrite what was transcribed; the original stays available.
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-secondary px-1.5 py-0.5">Corrected by you</span>
                <span title={segment.original_text}>Originally: “{segment.original_text}”</span>
                <button
                  type="button"
                  className="underline"
                  disabled={revert.isPending}
                  onClick={() => revert.mutate(undefined)}
                >
                  Undo correction
                </button>
              </p>
            )}
          </>
        )}
      </div>
      {draft === null && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Edit text at ${formatTimestamp(segment.start_s)}`}
          onClick={() => setDraft(segment.text)}
        >
          <Pencil />
        </Button>
      )}
    </li>
  );
});

export function TranscriptTab({
  meeting,
  highlight,
  currentTime,
  onPlay,
}: TabProps & { highlight: Highlight | null; currentTime: number; onPlay: (seconds: number) => void }) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const q = query.trim();

  const speakers = useMemo(
    () => new Map(meeting.speakers.map((s, i) => [s.id, { speaker: s, index: i }])),
    [meeting.speakers],
  );
  const visible = useMemo(
    () => (q ? meeting.segments.filter((s) => s.text.toLowerCase().includes(q.toLowerCase())) : meeting.segments),
    [meeting.segments, q],
  );
  const highlighted = useMemo(() => new Set(highlight?.ids ?? []), [highlight]);

  // The segment being played right now.
  const activePosition = useMemo(() => {
    const seg = meeting.segments.find((s) => currentTime >= s.start_s && currentTime < s.end_s + 0.5);
    return seg?.position ?? -1;
  }, [meeting.segments, currentTime]);

  useEffect(() => {
    if (!highlight?.ids.length) return;
    setQuery(""); // make sure the target is not filtered out
    requestAnimationFrame(() =>
      document.getElementById(`segment-${highlight.ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, [highlight]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Speakers (click to rename):</span>
        {meeting.speakers.map((s, i) => (
          <SpeakerChip key={s.id} speaker={s} index={i} meetingId={meeting.id} />
        ))}
      </div>
      {meeting.speakers.length === 1 && !meeting.has_names_file && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Everyone is shown as one speaker because voices could not be told apart (speaker identification needs a
          Hugging Face token). To get real names, upload the meeting again with its Teams or Zoom transcript (.vtt).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-9"
            placeholder="Search the transcript…"
            aria-label="Search the transcript"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {q && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {visible.length} matching {visible.length === 1 ? "segment" : "segments"}
          </span>
        )}
      </div>

      <ol ref={listRef} className="space-y-1" aria-label="Transcript">
        {visible.map((seg) => {
          const sp = seg.speaker_id != null ? speakers.get(seg.speaker_id) : undefined;
          return (
            <SegmentRow
              key={seg.id}
              segment={seg}
              speaker={sp?.speaker}
              speakerIndex={sp?.index ?? 0}
              query={q}
              active={seg.position === activePosition}
              highlighted={highlighted.has(seg.position)}
              highlightNonce={highlight?.nonce ?? 0}
              meetingId={meeting.id}
              onPlay={onPlay}
            />
          );
        })}
      </ol>
    </div>
  );
}

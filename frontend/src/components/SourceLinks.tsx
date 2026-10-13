import { AlertTriangle, Link2 } from "lucide-react";
import type { Segment } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

/**
 * "Source" buttons under each AI-generated point (FR9, US6). Clicking one jumps
 * to that part of the transcript and plays it. Points the backend could not
 * match to any real transcript line are flagged so the user knows to check them.
 */
export function SourceLinks({
  ids,
  hasSource,
  segmentsByPosition,
  onJump,
}: {
  ids: number[];
  hasSource: boolean;
  segmentsByPosition: Map<number, Segment>;
  onJump: (ids: number[]) => void;
}) {
  const segments = ids.map((id) => segmentsByPosition.get(id)).filter((s): s is Segment => !!s);
  if (!hasSource || segments.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
        <AlertTriangle className="size-3.5" aria-hidden />
        <span className="rounded bg-warning px-1.5 py-0.5">No source found in the transcript — please check</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="sr-only">Sources:</span>
      {segments.map((s) => (
        <button
          key={s.position}
          type="button"
          onClick={() => onJump([s.position])}
          className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
          aria-label={`Go to transcript at ${formatTimestamp(s.start_s)}`}
        >
          <Link2 className="size-3" aria-hidden />
          {formatTimestamp(s.start_s)}
        </button>
      ))}
    </span>
  );
}

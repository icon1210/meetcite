import { Bot, CircleAlert, CircleCheck, CircleHelp, CircleX, PenLine, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { Checked, EvidenceStatus, ReviewLabel, Segment, Verification, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useReviews, type ClaimRef } from "./meeting/reviews";
import { SourceLinks } from "./SourceLinks";

const AI_STYLES: Record<Verdict, { label: string; className: string }> = {
  supported: { label: "AI check: supported", className: "bg-success text-success-foreground" },
  partial: { label: "AI check: partly supported", className: "bg-warning text-warning-foreground" },
  unsupported: {
    label: "AI check: not supported",
    className: "bg-destructive/15 text-destructive dark:bg-destructive/25 dark:text-red-200",
  },
  unverified: { label: "Not AI-checked", className: "bg-muted text-muted-foreground" },
  user: { label: "Written by you", className: "bg-secondary text-secondary-foreground" },
};

/**
 * The automatic AI check. It is an aid for reviewers, not proof (spec §13): the wording
 * says "AI check" so it is never mistaken for a verified fact.
 */
export function VerdictBadge({ verdict, note }: { verdict: Verdict; note: string | null }) {
  const { label, className } = AI_STYLES[verdict];
  const Icon = verdict === "user" ? PenLine : Bot;
  const showNote = note && (verdict === "partial" || verdict === "unsupported");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", className)}
        title={note ?? undefined}
      >
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      {showNote && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

const EVIDENCE: Record<Exclude<EvidenceStatus, "valid" | "user">, { label: string; hint: string }> = {
  missing: { label: "No evidence cited", hint: "The AI did not point to any part of the transcript for this." },
  invalid: {
    label: "Cited evidence does not exist",
    hint: "The AI cited transcript lines that are not in this meeting.",
  },
};

/** Flags claims with missing or invalid evidence (US8). Valid evidence shows as time links instead. */
export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  if (status === "valid" || status === "user") return null;
  const { label, hint } = EVIDENCE[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-warning px-1.5 py-0.5 text-xs font-medium text-warning-foreground"
      title={hint}
    >
      <TriangleAlert className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

const REVIEW_OPTIONS: { label: ReviewLabel; text: string; Icon: typeof CircleCheck; active: string }[] = [
  { label: "supported", text: "Supported", Icon: CircleCheck, active: "bg-emerald-600 text-white" },
  { label: "partial", text: "Partly", Icon: TriangleAlert, active: "bg-amber-500 text-black" },
  { label: "unsupported", text: "Unsupported", Icon: CircleX, active: "bg-red-600 text-white" },
  { label: "contradicted", text: "Contradicted", Icon: CircleAlert, active: "bg-red-800 text-white" },
  { label: "unclear", text: "Unclear", Icon: CircleHelp, active: "bg-slate-600 text-white" },
];

/** The human factual-support label (spec §21 rubric). This, not the AI check, is the evaluation evidence. */
export function ReviewControl({ claim }: { claim: ClaimRef }) {
  const reviews = useReviews();
  const [open, setOpen] = useState(false);
  if (!reviews) return null;
  const current = reviews.reviewFor(claim.key)?.label;
  const pending = reviews.pendingKey === claim.key;
  const chosen = REVIEW_OPTIONS.find((o) => o.label === current);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs",
          chosen ? chosen.active + " border-transparent" : "border-dashed text-muted-foreground hover:bg-muted",
        )}
        aria-label={chosen ? `Your review: ${chosen.text}. Change review` : "Review this claim"}
      >
        {chosen ? (
          <>
            <chosen.Icon className="size-3.5" aria-hidden /> You: {chosen.text}
          </>
        ) : (
          "Review"
        )}
      </button>
    );
  }
  return (
    <span role="group" aria-label="Is this claim supported by the transcript?" className="inline-flex flex-wrap gap-1">
      {REVIEW_OPTIONS.map(({ label, text, Icon, active }) => (
        <button
          key={label}
          type="button"
          disabled={pending}
          aria-pressed={current === label}
          onClick={() => {
            reviews.submit(claim, label);
            setOpen(false);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs",
            current === label ? active + " border-transparent" : "hover:bg-muted",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {text}
        </button>
      ))}
      <button type="button" className="px-1 text-xs text-muted-foreground underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}

/** Evidence links, evidence status, AI check and human review, shown under every generated claim. */
export function ItemMeta({
  item,
  claim,
  segmentsByPosition,
  onJump,
}: {
  item: Checked;
  claim?: ClaimRef;
  segmentsByPosition: Map<number, Segment>;
  onJump: (ids: number[]) => void;
}) {
  const status = item.evidence_status ?? (item.has_source ? "valid" : "missing");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {status === "valid" && item.source_segment_ids.length > 0 && (
        <SourceLinks ids={item.source_segment_ids} hasSource segmentsByPosition={segmentsByPosition} onJump={onJump} />
      )}
      <EvidenceBadge status={status} />
      <VerdictBadge verdict={item.verdict} note={item.verdict_note} />
      {claim && item.verdict !== "user" && <ReviewControl claim={claim} />}
    </div>
  );
}

const METHOD_LABELS: Record<string, string> = {
  llm: "checked by the AI",
  "word-overlap": "checked by word matching (less reliable — the AI checker was not available)",
  "llm+word-overlap": "mostly checked by the AI, some points by word matching",
};

/** How the automatic AI check rated these notes. Human review remains the measure of accuracy. */
export function TrustBar({ verification }: { verification: Verification }) {
  const { supported, partial, unsupported, method } = verification;
  const total = supported + partial + unsupported;
  if (!total) {
    return method.startsWith("none") ? (
      <p className="text-sm text-muted-foreground">
        This is the baseline configuration: it does not cite evidence, so there is nothing to check automatically.
      </p>
    ) : null;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          AI check: {Math.round((supported / total) * 100)}% of {total} points look supported by their cited lines
        </p>
        <p className="text-xs text-muted-foreground">{METHOD_LABELS[method] ?? method}</p>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-emerald-500" style={{ width: pct(supported) }} />
        <div className="bg-amber-400" style={{ width: pct(partial) }} />
        <div className="bg-red-500" style={{ width: pct(unsupported) }} />
      </div>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" aria-hidden />
          {supported} supported
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-amber-400" aria-hidden />
          {partial} partly supported
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-red-500" aria-hidden />
          {unsupported} not supported — check these
        </span>
        <span>The AI check can be wrong; use the Review buttons to record your own judgement.</span>
      </p>
    </div>
  );
}

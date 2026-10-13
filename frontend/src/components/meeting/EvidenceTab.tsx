import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/misc";
import type { Checked } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ItemMeta } from "../Verdict";
import { claimRef, useReviews, type ClaimRef } from "./reviews";
import type { TabProps } from "./shared";

interface ClaimRow {
  kind: string;
  text: string;
  item: Checked;
  claim: ClaimRef;
}

/** Every checkable statement in the active summary, in reading order. */
function collectClaims({ meeting }: Pick<TabProps, "meeting">): ClaimRow[] {
  const s = meeting.summary;
  if (!s) return [];
  const inSummary = (type: ClaimRef["type"], path: string) => claimRef.inSummary(type, s.id, path);
  const rows: ClaimRow[] = [];
  s.points.forEach((p, i) =>
    rows.push({ kind: "Key point", text: p.text, item: p, claim: inSummary("point", `point:${i}`) }),
  );
  s.topics.forEach((t, ti) => {
    rows.push({ kind: `Topic: ${t.title}`, text: t.summary, item: t, claim: inSummary("topic", `topic:${ti}`) });
    t.positions.forEach((p, i) =>
      rows.push({
        kind: `Position · ${t.title}`,
        text: `${p.speaker}: ${p.view}`,
        item: p,
        claim: inSummary("position", `topic:${ti}:position:${i}`),
      }),
    );
    t.points.forEach((p, i) =>
      rows.push({
        kind: `Point · ${t.title}`,
        text: p.text,
        item: p,
        claim: inSummary("point", `topic:${ti}:point:${i}`),
      }),
    );
  });
  meeting.decisions.forEach((d) =>
    rows.push({ kind: "Decision", text: d.text, item: d, claim: claimRef.decision(d.id) }),
  );
  meeting.action_items.forEach((a) =>
    rows.push({
      kind: "Action item",
      text: [a.task, a.owner && `Owner: ${a.owner}`, a.deadline && `Due: ${a.deadline}`].filter(Boolean).join(" · "),
      item: a,
      claim: claimRef.action(a.id),
    }),
  );
  s.open_questions.forEach((q, i) =>
    rows.push({ kind: "Open question", text: q.text, item: q, claim: inSummary("question", `question:${i}`) }),
  );
  s.risks.forEach((r, i) => rows.push({ kind: "Risk", text: r.text, item: r, claim: inSummary("risk", `risk:${i}`) }));
  return rows;
}

const needsAttention = (c: Checked) =>
  c.verdict === "partial" ||
  c.verdict === "unsupported" ||
  c.evidence_status === "missing" ||
  c.evidence_status === "invalid";

type View = "attention" | "unreviewed" | "all";

/**
 * Evidence review: one queue of every generated claim. Claims the automatic check could not
 * confirm come first; reviewers label each one, and those labels are the study's ground truth.
 */
export function EvidenceTab({ meeting, segmentsByPosition, onJump }: TabProps) {
  const reviews = useReviews();
  const rows = useMemo(() => collectClaims({ meeting }), [meeting]);
  const flagged = rows.filter((r) => needsAttention(r.item));
  const reviewed = rows.filter((r) => reviews?.reviewFor(r.claim.key)).length;
  const [view, setView] = useState<View>(flagged.length ? "attention" : "unreviewed");

  if (!meeting.summary || meeting.summary.configuration === "baseline") {
    return (
      <p className="text-sm text-muted-foreground">
        {meeting.summary
          ? "The baseline version cites no evidence, so there is nothing to review here. Switch to the evidence-grounded version in the Compare tab."
          : "No minutes yet."}
      </p>
    );
  }

  const shown =
    view === "attention"
      ? flagged
      : view === "unreviewed"
        ? rows.filter((r) => !reviews?.reviewFor(r.claim.key))
        : rows;
  const pct = rows.length ? Math.round((reviewed / rows.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-3xl font-bold">{rows.length}</p>
          <p className="text-sm text-muted-foreground">claims in these minutes</p>
        </div>
        <div>
          <p className={cn("text-3xl font-bold", flagged.length ? "text-amber-600 dark:text-amber-400" : "")}>
            {flagged.length}
          </p>
          <p className="text-sm text-muted-foreground">need attention (partly or not supported, or no evidence)</p>
        </div>
        <div>
          <p className="text-3xl font-bold">{pct}%</p>
          <p className="text-sm text-muted-foreground">
            reviewed by you ({reviewed} of {rows.length})
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which claims to show">
        {(
          [
            ["attention", `Needs attention (${flagged.length})`],
            ["unreviewed", `Not yet reviewed (${rows.length - reviewed})`],
            ["all", `All claims (${rows.length})`],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              view === id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
          {view === "attention"
            ? "Nothing flagged: every claim's evidence was confirmed by the AI check."
            : "All done here."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.claim.key}>
              <Card className={cn("space-y-2 p-4", needsAttention(r.item) && "border-l-4 border-l-amber-500")}>
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {needsAttention(r.item) && <ShieldAlert className="size-3.5 text-amber-600" aria-hidden />}
                  {r.kind}
                </p>
                <p>{r.text}</p>
                <ItemMeta item={r.item} claim={r.claim} segmentsByPosition={segmentsByPosition} onJump={onJump} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

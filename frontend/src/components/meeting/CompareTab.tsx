import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Columns2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Alert, Card, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { Checked, MeetingDetail, Summarizer, Summary } from "@/lib/types";
import { SUMMARIZER_LABELS } from "@/lib/utils";
import { ItemMeta } from "../Verdict";
import { claimRef } from "./reviews";
import type { TabProps } from "./shared";

function evidenceCounts(s: Summary) {
  const items: Checked[] = [...s.points, ...s.decisions, ...s.action_items, ...s.open_questions, ...s.risks];
  const count = (status: string) => items.filter((i) => i.evidence_status === status).length;
  return { total: items.length, valid: count("valid"), missing: count("missing"), invalid: count("invalid") };
}

function Facts({ s }: { s: Summary }) {
  const ev = evidenceCounts(s);
  const owners = s.action_items.filter((a) => a.owner).length;
  const deadlines = s.action_items.filter((a) => a.deadline).length;
  const seconds = Object.values(s.timings).reduce((a, b) => a + b, 0);
  const rows: [string, string][] = [
    ["Model", s.model_used],
    ["Prompt version", s.prompt_version || "—"],
    ["Generation time", `${seconds.toFixed(1)} s`],
    ["Key points / topics", `${s.points.length} / ${s.topics.length}`],
    ["Decisions / action items", `${s.decisions.length} / ${s.action_items.length}`],
    ["Actions with owner / deadline", `${owners} / ${deadlines} of ${s.action_items.length}`],
    ["Claims with valid evidence", `${ev.valid} of ${ev.total}`],
    ["Missing / invalid evidence", `${ev.missing} / ${ev.invalid}`],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Column({ s, meeting, ...meta }: { s: Summary; meeting: MeetingDetail } & Omit<TabProps, "meeting">) {
  const queryClient = useQueryClient();
  const activate = useMutation({
    mutationFn: () => api.activateSummary(meeting.id, s.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] }),
  });
  return (
    <Card className="min-w-0 space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{SUMMARIZER_LABELS[s.configuration] ?? s.configuration}</h3>
        {s.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" aria-hidden /> Shown in Summary tab
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => activate.mutate()} disabled={activate.isPending}>
            Use this version
          </Button>
        )}
      </div>
      <Facts s={s} />
      {s.overview && <p className="text-sm leading-relaxed">{s.overview}</p>}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Decisions</h4>
        {s.decisions.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
        <ul className="space-y-2">
          {s.decisions.map((d) => (
            <li key={d.id} className="space-y-1 text-sm">
              <p>{d.text}</p>
              <ItemMeta item={d} claim={claimRef.decision(d.id)} {...meta} />
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Action items</h4>
        {s.action_items.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
        <ul className="space-y-2">
          {s.action_items.map((a) => (
            <li key={a.id} className="space-y-1 text-sm">
              <p>
                {a.task}{" "}
                <span className="text-muted-foreground">
                  — {a.owner ?? "owner not stated"}, {a.deadline ?? "no deadline stated"}
                </span>
              </p>
              <ItemMeta item={a} claim={claimRef.action(a.id)} {...meta} />
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

/** Side-by-side outputs of two configurations on the same transcript (FR13, FR18). */
export function CompareTab({ meeting, segmentsByPosition, onJump }: TabProps) {
  const queryClient = useQueryClient();
  const versions = meeting.summaries;
  // The user's explicit choices; until then, default to C1 on the left and C2 on the right.
  const [left, setLeft] = useState<number | undefined>();
  const [right, setRight] = useState<number | undefined>();
  const generate = useMutation({
    mutationFn: (model: Summarizer) => api.regenerate(meeting.id, model),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] }),
  });
  const missing = (["baseline", "llm"] as Summarizer[]).filter((c) => !versions.some((s) => s.configuration === c));
  const byId = (id: number | undefined) => versions.find((s) => s.id === id);
  const byConfig = (c: string) => versions.find((s) => s.configuration === c);
  const a = byId(left) ?? byConfig("baseline") ?? versions[0];
  const b =
    byId(right) ??
    versions.find((s) => s.configuration === "llm" && s.id !== a?.id) ??
    versions.find((s) => s.id !== a?.id);
  const meta = { segmentsByPosition, onJump };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Columns2 className="size-5 text-primary" aria-hidden /> Compare configurations
        </h2>
        <p className="text-sm text-muted-foreground">
          Both versions summarise the same transcript. C1 uses a plain prompt; C2 must cite the transcript lines behind
          every claim. Use the Review buttons to label each claim; those labels are the evidence for the evaluation.
        </p>
      </div>

      {missing.length > 0 && (
        <Alert className="flex flex-wrap items-center gap-3">
          <span>Not generated yet: {missing.map((m) => SUMMARIZER_LABELS[m]).join(", ")}.</span>
          {missing.map((m) => (
            <Button
              key={m}
              size="sm"
              variant="outline"
              disabled={generate.isPending || meeting.status === "processing"}
              onClick={() => generate.mutate(m)}
            >
              {generate.isPending && generate.variables === m && <Spinner />} Generate {SUMMARIZER_LABELS[m]}
            </Button>
          ))}
          {generate.isError && <span className="text-destructive">{(generate.error as Error).message}</span>}
        </Alert>
      )}

      {versions.length >= 2 && (
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["Left", a, setLeft],
              ["Right", b, setRight],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex items-center gap-2 text-sm">
              {label}
              <Select className="h-8 w-auto" value={value?.id} onChange={(e) => set(Number(e.target.value))}>
                {versions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {SUMMARIZER_LABELS[s.configuration] ?? s.configuration}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {a && <Column s={a} meeting={meeting} {...meta} />}
        {b && b.id !== a?.id && <Column s={b} meeting={meeting} {...meta} />}
      </div>
    </div>
  );
}

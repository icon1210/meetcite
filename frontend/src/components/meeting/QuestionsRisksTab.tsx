import { CircleHelp, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { SummaryPoint } from "@/lib/types";
import { ItemMeta } from "../Verdict";
import { claimRef, type ClaimRef } from "./reviews";
import type { TabProps } from "./shared";

function ItemList({
  title,
  description,
  icon,
  items,
  empty,
  claimFor,
  ...meta
}: {
  title: string;
  description: string;
  icon: ReactNode;
  items: SummaryPoint[];
  empty: string;
  claimFor?: (index: number) => ClaimRef;
} & Omit<TabProps, "meeting">) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          {icon}
          {title} <span className="text-base font-normal text-muted-foreground">({items.length})</span>
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="space-y-1 rounded-md border p-3">
              <p>{item.text}</p>
              <ItemMeta item={item} claim={claimFor?.(i)} {...meta} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What the meeting left unresolved: open questions and the concerns people raised. */
export function QuestionsRisksTab({ meeting, segmentsByPosition, onJump }: TabProps) {
  const meta = { segmentsByPosition, onJump };
  const summary = meeting.summary;
  return (
    <div className="space-y-8">
      <ItemList
        title="Open questions"
        description="Questions raised in the meeting that were not answered. Good candidates for the next agenda."
        icon={<CircleHelp className="size-5 text-primary" aria-hidden />}
        items={summary?.open_questions ?? []}
        empty="No unanswered questions were found."
        claimFor={summary ? (i) => claimRef.inSummary("question", summary.id, `question:${i}`) : undefined}
        {...meta}
      />
      <ItemList
        title="Risks and concerns"
        description="Problems, blockers, dependencies and worries that participants raised."
        icon={<ShieldAlert className="size-5 text-primary" aria-hidden />}
        items={summary?.risks ?? []}
        empty="No risks or concerns were raised."
        claimFor={summary ? (i) => claimRef.inSummary("risk", summary.id, `risk:${i}`) : undefined}
        {...meta}
      />
    </div>
  );
}

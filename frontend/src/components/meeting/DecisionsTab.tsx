import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { Decision } from "@/lib/types";
import { ItemMeta } from "../Verdict";
import { claimRef } from "./reviews";
import { useMeetingMutation, type TabProps } from "./shared";

function DecisionRow({ decision, ...props }: { decision: Decision } & TabProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const save = useMeetingMutation(props.meeting.id, (text: string) => api.editDecision(decision.id, text));
  const remove = useMeetingMutation(props.meeting.id, () => api.deleteDecision(decision.id));

  if (editing !== null) {
    return (
      <li className="space-y-2 rounded-md border p-3">
        <Textarea aria-label="Decision text" value={editing} onChange={(e) => setEditing(e.target.value)} rows={2} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!editing.trim() || save.isPending}
            onClick={() => save.mutate(editing.trim(), { onSuccess: () => setEditing(null) })}
          >
            {save.isPending && <Spinner />} Save
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 rounded-md border p-3">
      <div className="flex-1 space-y-1">
        <p>{decision.text}</p>
        <ItemMeta
          item={decision}
          claim={claimRef.decision(decision.id)}
          segmentsByPosition={props.segmentsByPosition}
          onJump={props.onJump}
        />
      </div>
      <Button variant="ghost" size="icon" aria-label="Edit decision" onClick={() => setEditing(decision.text)}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete decision" onClick={() => remove.mutate(undefined)}>
        <Trash2 />
      </Button>
    </li>
  );
}

export function DecisionsTab(props: TabProps) {
  if (props.meeting.decisions.length === 0) {
    return <p className="text-muted-foreground">No decisions were identified in this meeting.</p>;
  }
  return (
    <ul className="space-y-2">
      {props.meeting.decisions.map((d) => (
        <DecisionRow key={d.id} decision={d} {...props} />
      ))}
    </ul>
  );
}

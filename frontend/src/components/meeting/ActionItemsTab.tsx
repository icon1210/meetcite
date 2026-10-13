import { AlertTriangle, Calendar, Pencil, Plus, Trash2, User } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { ActionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ItemMeta } from "../Verdict";
import { claimRef } from "./reviews";
import { useMeetingMutation, type TabProps } from "./shared";

type Draft = { task: string; owner: string; deadline: string };

function ActionForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  pending: boolean;
  onSubmit: (d: Draft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (d.task.trim()) onSubmit(d);
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr]">
      <div className="space-y-1">
        <Label htmlFor={id("task")}>Task</Label>
        <Input id={id("task")} value={d.task} onChange={(e) => setD({ ...d, task: e.target.value })} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("owner")}>Owner</Label>
        <Input id={id("owner")} value={d.owner} onChange={(e) => setD({ ...d, owner: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("deadline")}>Deadline</Label>
        <Input id={id("deadline")} value={d.deadline} onChange={(e) => setD({ ...d, deadline: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !d.task.trim()}>
          {pending && <Spinner />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ActionRow({ item, ...props }: { item: ActionItem } & TabProps) {
  const [editing, setEditing] = useState(false);
  const update = useMeetingMutation(props.meeting.id, (body: Parameters<typeof api.editActionItem>[1]) =>
    api.editActionItem(item.id, body),
  );
  const remove = useMeetingMutation(props.meeting.id, () => api.deleteActionItem(item.id));
  // Show the new state immediately while the change is saved (optimistic update). This is local
  // state rather than the mutation's own state, which updates a tick later and made the box flicker.
  const [pendingStatus, setPendingStatus] = useState<ActionItem["status"] | null>(null);
  const done = (pendingStatus ?? item.status) === "done";
  const toggle = () => {
    const next = done ? "open" : "done";
    setPendingStatus(next);
    update.mutate({ status: next }, { onSettled: () => setPendingStatus(null) });
  };
  const checkboxId = `action-done-${item.id}`;

  if (editing) {
    return (
      <li>
        <ActionForm
          initial={{ task: item.task, owner: item.owner ?? "", deadline: item.deadline ?? "" }}
          submitLabel="Save"
          pending={update.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(d) => update.mutate(d, { onSuccess: () => setEditing(false) })}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-md border p-3">
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-1 size-4 accent-[hsl(var(--primary))]"
        checked={done}
        onChange={toggle}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <label htmlFor={checkboxId} className={cn("block", done && "text-muted-foreground line-through")}>
          {item.task}
        </label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {/* Missing owners and deadlines are flagged: vague commitments are how tasks get lost. */}
          {item.owner ? (
            <span className="inline-flex items-center gap-1">
              <User className="size-3.5" aria-hidden />
              <span className="sr-only">Owner:</span>
              {item.owner}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-warning px-1.5 text-warning-foreground">
              <AlertTriangle className="size-3.5" aria-hidden /> Nobody assigned
            </span>
          )}
          {item.deadline ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden />
              <span className="sr-only">Deadline:</span>
              {item.deadline}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-warning px-1.5 text-warning-foreground">
              <AlertTriangle className="size-3.5" aria-hidden /> No deadline
            </span>
          )}
        </div>
        <ItemMeta
          item={item}
          claim={claimRef.action(item.id)}
          segmentsByPosition={props.segmentsByPosition}
          onJump={props.onJump}
        />
      </div>
      <Button variant="ghost" size="icon" aria-label={`Edit action: ${item.task}`} onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete action: ${item.task}`}
        onClick={() => remove.mutate(undefined)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function ActionItemsTab(props: TabProps) {
  const [adding, setAdding] = useState(false);
  const add = useMeetingMutation(props.meeting.id, (d: Draft) =>
    api.addActionItem(props.meeting.id, { task: d.task, owner: d.owner || null, deadline: d.deadline || null }),
  );
  const items = props.meeting.action_items;
  const open = items.filter((i) => i.status === "open").length;
  const gaps = items.filter((i) => i.status === "open" && (!i.owner || !i.deadline)).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {items.length === 0 ? "No action items were identified." : `${open} open of ${items.length}`}
      </p>
      {gaps > 0 && (
        <Alert variant="warning" className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {gaps} open action {gaps === 1 ? "item is" : "items are"} missing an owner or a deadline. Use the pencil
            button to assign one before sharing the minutes.
          </span>
        </Alert>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <ActionRow key={item.id} item={item} {...props} />
        ))}
      </ul>
      {adding ? (
        <ActionForm
          initial={{ task: "", owner: "", deadline: "" }}
          submitLabel="Add"
          pending={add.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => add.mutate(d, { onSuccess: () => setAdding(false) })}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add action item
        </Button>
      )}
    </div>
  );
}

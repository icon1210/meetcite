import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";

const NEW = "__new";

/**
 * Pick the meeting series (project memory) a meeting belongs to, or create one on the spot.
 * `value` is the series id, or null for "not part of a series".
 */
export function SeriesSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number | null;
  onChange: (seriesId: number | null) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const series = useQuery({ queryKey: ["series"], queryFn: api.listSeries });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.createSeries(name.trim()),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      onChange(s.id);
      setCreating(false);
      setName("");
    },
  });

  if (creating) {
    return (
      // A div, not a form: this control often sits inside another form (e.g. the upload form).
      <div className="flex gap-2">
        <Input
          id={id}
          autoFocus
          value={name}
          maxLength={120}
          placeholder="e.g. Weekly team meeting"
          aria-label="New series name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          aria-label="Create series"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Check />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setCreating(false)}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <Select
      id={id}
      value={value === null ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === NEW) setCreating(true);
        else onChange(e.target.value ? Number(e.target.value) : null);
      }}
    >
      <option value="">Not part of a series</option>
      {(series.data ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value={NEW}>+ New series…</option>
    </Select>
  );
}

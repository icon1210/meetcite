import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 75.4 -> "1:15", 3725 -> "1:02:05" */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** 3725 -> "1 h 2 min", 95 -> "2 min", null -> "—" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "< 1 min";
  const h = Math.floor(mins / 60);
  return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A readable name for the model that wrote a summary, e.g. "anthropic:claude-opus-5-5" -> "Claude". */
export function friendlyModel(raw: string): string {
  if (raw.includes("(sample)")) return "the demo generator";
  if (raw.startsWith("anthropic:")) return "Claude";
  if (raw.startsWith("ollama:")) return `${raw.slice("ollama:".length).split(":")[0]} (local)`;
  if (raw.startsWith("bart:")) return "BART";
  if (raw === "manual") return "you";
  return raw;
}

/** The summarisation configurations compared in the evaluation (spec §21). */
export const SUMMARIZER_LABELS: Record<string, string> = {
  llm: "C2 · Evidence-grounded",
  baseline: "C1 · Baseline (no citations)",
  bart: "C3 · BART",
  cloud: "Cloud LLM (evidence-grounded)",
  manual: "Written by you",
};

// Speaker colours, chosen to stay distinguishable and readable in light and dark mode.
const SPEAKER_COLOURS = [
  "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
  "bg-lime-100 text-lime-900 dark:bg-lime-900/50 dark:text-lime-100",
  "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/50 dark:text-fuchsia-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100",
];
const SPEAKER_BORDERS = [
  "border-sky-400",
  "border-amber-400",
  "border-violet-400",
  "border-emerald-400",
  "border-rose-400",
  "border-lime-400",
  "border-fuchsia-400",
  "border-orange-400",
];

export function speakerColour(index: number): { chip: string; border: string } {
  const i = ((index % SPEAKER_COLOURS.length) + SPEAKER_COLOURS.length) % SPEAKER_COLOURS.length;
  return { chip: SPEAKER_COLOURS[i], border: SPEAKER_BORDERS[i] };
}

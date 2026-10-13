import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "Mindy", MeetCite's animated companion. Its face shows what MeetCite is doing:
 *   idle        - blinks, sways and follows the pointer with its eyes
 *   listening   - headphones on; the mouth moves with the incoming sound (recording, transcribing)
 *   thinking    - looks up, thought bubbles (preparing, identifying speakers)
 *   writing     - looks down at a pencil (writing the minutes)
 *   checking    - magnifying glass sweeping across (checking evidence)
 *   celebrating - big smile, bounce and sparkles (done)
 *   sad         - apologetic frown and a tear (failed)
 * Purely decorative (aria-hidden); any message it "says" is shown as real text.
 * Animations stop for people who prefer reduced motion.
 */
export type Mood = "idle" | "listening" | "thinking" | "writing" | "checking" | "celebrating" | "sad";

export const MOOD_FOR_STAGE: Record<string, Mood> = {
  queued: "thinking",
  preprocessing: "thinking",
  transcribing: "listening",
  diarizing: "listening",
  aligning: "thinking",
  summarizing: "writing",
  verifying: "checking",
  completed: "celebrating",
  failed: "sad",
};

export function moodFor(status: string, stage?: string | null): Mood {
  if (status === "failed") return "sad";
  if (status === "completed") return "celebrating";
  return MOOD_FOR_STAGE[stage ?? "queued"] ?? "thinking";
}

/** Celebrate (or look sorry) for a few seconds whenever a meeting finishes anywhere in the app. */
export function useAnnouncedMood(base: Mood): Mood {
  const [override, setOverride] = useState<Mood | null>(null);
  useEffect(() => {
    let timer = 0;
    const onAnnounce = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail?.ok;
      setOverride(ok ? "celebrating" : "sad");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOverride(null), 6000);
    };
    window.addEventListener("meetcite:announce", onAnnounce);
    return () => {
      window.removeEventListener("meetcite:announce", onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);
  return override ?? base;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Pupils follow the pointer while Mindy is idle. */
function usePointerLook(ref: React.RefObject<SVGSVGElement | null>, active: boolean) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setLook({ x: 0, y: 0 });
      return;
    }
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height * 0.45);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, dist / 300);
        setLook({ x: (dx / dist) * 5 * reach, y: (dy / dist) * 5 * reach });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [active, ref]);
  return look;
}

const FIXED_LOOK: Partial<Record<Mood, { x: number; y: number }>> = {
  thinking: { x: 4, y: -5 },
  writing: { x: 2, y: 5 },
  sad: { x: 0, y: 3 },
  celebrating: { x: 0, y: -1 },
};

function Mouth({ mood, level }: { mood: Mood; level: number }) {
  const stroke = { stroke: "#3b0a2a", strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };
  switch (mood) {
    case "celebrating":
      return (
        <g>
          <path d="M74 124 Q100 166 126 124 Z" fill="#3b0a2a" />
          <path d="M88 142 Q100 156 112 142 Q100 136 88 142 Z" fill="#fb7185" />
        </g>
      );
    case "listening":
      // Opens with the sound level, like lip-syncing to the meeting.
      return <ellipse cx="100" cy="134" rx={9 + level * 4} ry={3 + level * 13} fill="#3b0a2a" className="mm-mouth" />;
    case "thinking":
      return <path d="M90 136 Q102 130 112 135" {...stroke} />;
    case "checking":
      return <path d="M88 134 Q100 140 112 134" {...stroke} />;
    case "writing":
      return (
        <g>
          <path d="M86 131 Q100 143 114 131" {...stroke} />
          <ellipse cx="108" cy="139" rx="4.5" ry="3.5" fill="#fb7185" />
        </g>
      );
    case "sad":
      return <path d="M82 142 Q100 126 118 142" {...stroke} />;
    default:
      return <path d="M78 127 Q100 150 122 127" {...stroke} />;
  }
}

export function Buddy({
  mood,
  level = 0,
  size = 120,
  className,
}: {
  mood: Mood;
  /** 0-1 sound level; animates the mouth while listening. */
  level?: number;
  size?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const followed = usePointerLook(ref, mood === "idle");
  const look = FIXED_LOOK[mood] ?? followed;
  const eyeY = mood === "celebrating" ? 92 : 95;

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      className={cn("mm-buddy shrink-0 overflow-visible", `mm-buddy--${mood}`, className)}
    >
      <defs>
        <radialGradient id="mm-skin" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset="0.45" stopColor="#f97316" />
          <stop offset="0.8" stopColor="#e11d48" />
          <stop offset="1" stopColor="#a21caf" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="186" rx="52" ry="7" fill="#000" opacity="0.18" className="mm-shadow" />

      <g className="mm-body">
        {/* Antenna: the "mind" light pulses while thinking */}
        <path d="M100 34 Q104 22 112 16" stroke="#7c2d12" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="113" cy="15" r="7" fill="#fbbf24" className="mm-antenna" />

        <circle cx="100" cy="105" r="72" fill="url(#mm-skin)" />
        <ellipse cx="76" cy="62" rx="16" ry="10" fill="#fff" opacity="0.3" />

        {/* Headphones while listening */}
        {mood === "listening" && (
          <g className="mm-prop">
            <path d="M34 104 Q34 30 100 30 Q166 30 166 104" stroke="#6b21a8" strokeWidth="9" fill="none" />
            <rect x="22" y="92" width="20" height="38" rx="9" fill="#6b21a8" />
            <rect x="158" y="92" width="20" height="38" rx="9" fill="#6b21a8" />
            <rect x="26" y="99" width="6" height="24" rx="3" fill="#fb7185" />
            <rect x="168" y="99" width="6" height="24" rx="3" fill="#fb7185" />
          </g>
        )}

        {/* Eyes (blink together) */}
        <g className="mm-eyes">
          {[75, 125].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy={eyeY} rx="15" ry={mood === "celebrating" ? 13 : 17} fill="#fff" />
              <g className="mm-pupil" style={{ transform: `translate(${look.x}px, ${look.y}px)` }}>
                <circle cx={cx} cy={eyeY + 1} r="8" fill="#2a0e2e" />
                <circle cx={cx + 3} cy={eyeY - 3} r="2.6" fill="#fff" />
              </g>
            </g>
          ))}
          {mood === "sad" && (
            <>
              {/* Inner ends raised: worried, not cross */}
              <path d="M60 80 L86 71" stroke="#3b0a2a" strokeWidth="4" strokeLinecap="round" />
              <path d="M140 80 L114 71" stroke="#3b0a2a" strokeWidth="4" strokeLinecap="round" />
            </>
          )}
          {mood === "thinking" && (
            <path d="M112 72 Q125 64 140 70" stroke="#3b0a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
          )}
        </g>

        {/* Cheeks */}
        <ellipse cx="58" cy="122" rx="11" ry="6.5" fill="#fda4af" opacity={mood === "celebrating" ? 0.85 : 0.55} />
        <ellipse cx="142" cy="122" rx="11" ry="6.5" fill="#fda4af" opacity={mood === "celebrating" ? 0.85 : 0.55} />

        <Mouth mood={mood} level={level} />

        {mood === "sad" && <path d="M134 108 Q138 118 134 122 Q130 118 134 108 Z" fill="#7dd3fc" className="mm-tear" />}
      </g>

      {/* Mood props outside the head */}
      {mood === "thinking" && (
        <g className="mm-thought" fill="#fff">
          <circle cx="166" cy="54" r="5" />
          <circle cx="180" cy="36" r="7" />
          <circle cx="194" cy="14" r="9" />
        </g>
      )}
      {mood === "writing" && (
        <g className="mm-pencil">
          {/* A note pad beside Mindy, with a pencil writing on it */}
          <rect x="138" y="146" width="52" height="38" rx="5" fill="#fff" stroke="#fda4af" strokeWidth="2" />
          <path d="M146 158 H182 M146 167 H176 M146 176 H166" stroke="#fda4af" strokeWidth="3" strokeLinecap="round" />
          <g className="mm-pencil-tip">
            <path d="M178 126 L160 162" stroke="#fbbf24" strokeWidth="9" />
            <path d="M178 126 L174 134" stroke="#fb7185" strokeWidth="9" />
            <path d="M156 160 L164 164 L158 172 Z" fill="#fde68a" />
            <circle cx="158" cy="170" r="2.2" fill="#3b0a2a" />
          </g>
        </g>
      )}
      {mood === "checking" && (
        <g className="mm-magnifier">
          <circle cx="132" cy="98" r="22" fill="#fff" fillOpacity="0.25" stroke="#2a0e2e" strokeWidth="6" />
          <path d="M148 114 L172 140" stroke="#2a0e2e" strokeWidth="9" strokeLinecap="round" />
        </g>
      )}
      {mood === "celebrating" && (
        <g className="mm-sparkles" fill="#fbbf24">
          {[
            [26, 46, 1],
            [176, 40, 0.8],
            [184, 132, 0.7],
            [18, 140, 0.9],
          ].map(([x, y, s], i) => (
            <path
              key={i}
              d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z"
              transform={`translate(${x} ${y}) scale(${s})`}
              style={{ animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

export type BubbleVariant = "info" | "warning" | "error";

const BUBBLE_STYLES: Record<BubbleVariant, string> = {
  info: "border bg-card text-card-foreground before:border-b before:border-l before:bg-card",
  warning:
    "border border-amber-300 bg-amber-50 text-amber-900 before:border-b before:border-l before:border-amber-300 before:bg-amber-50 " +
    "dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:before:border-amber-700 dark:before:bg-amber-950",
  error:
    "border border-red-300 bg-red-50 text-red-800 before:border-b before:border-l before:border-red-300 before:bg-red-50 " +
    "dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:before:border-red-800 dark:before:bg-red-950",
};

/**
 * Mindy with a speech bubble: she delivers MeetCite's messages, errors and warnings included.
 * The message is real text; errors use role="alert" so screen readers announce them at once.
 */
export function BuddyWithMessage({
  mood,
  message,
  variant = "info",
  level,
  size = 110,
  tone = "card",
  className,
}: {
  mood: Mood;
  message: string;
  variant?: BubbleVariant;
  level?: number;
  size?: number;
  tone?: "card" | "glass";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Buddy mood={mood} level={level} size={size} />
      <p
        key={message} // re-mounts on a new message, replaying the pop-in
        role={variant === "error" ? "alert" : "status"}
        aria-live={variant === "error" ? "assertive" : "polite"}
        className={cn(
          "mm-bubble relative min-w-0 max-w-md rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm",
          "before:absolute before:-left-1.5 before:top-1/2 before:size-3 before:-translate-y-1/2 before:rotate-45",
          tone === "glass" ? "bg-white/15 text-white backdrop-blur before:bg-white/15" : BUBBLE_STYLES[variant],
        )}
      >
        {message}
      </p>
    </div>
  );
}

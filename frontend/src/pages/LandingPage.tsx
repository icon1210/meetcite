import {
  ArrowRight,
  AudioLines,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Cpu,
  FileSearch,
  FlaskConical,
  GitCompare,
  KeyRound,
  ListChecks,
  Lock,
  Menu,
  Mic,
  MonitorSmartphone,
  Pencil,
  Plus,
  Quote,
  ServerCog,
  ShieldCheck,
  Timer,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Logo, ThemeToggle } from "@/components/AppLayout";
import { BuddyWithMessage } from "@/components/Buddy";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import "./landing.css";

/* ------------------------------------------------------------------------------------------------
 * Scroll reveal: elements fade up as they enter the viewport. Content stays visible without
 * JavaScript, without IntersectionObserver, and for people who prefer reduced motion.
 * ---------------------------------------------------------------------------------------------- */
function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"static" | "pending" | "shown">("static");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen: no effect
    setState("pending");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={className}
      data-reveal={state === "static" ? undefined : state}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#specs", label: "Specs" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#research", label: "Research" },
  { href: "#about", label: "About" },
];

function Header() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const account = user ? (
    <Link to="/" className="lp-btn lp-btn-primary lp-btn-sm">
      Open my meetings
    </Link>
  ) : (
    <>
      <Link to="/login" className="lp-nav-link">
        Sign In
      </Link>
      <Link to="/register" className="lp-btn lp-btn-primary lp-btn-sm">
        Get Started
      </Link>
    </>
  );

  return (
    <header
      className="lp-header lp-dark sticky top-0 z-40 [&_button:not(.lp-nav-link)]:text-white"
      data-scrolled={scrolled}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="MeetCite home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="lp-nav-link">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {account}
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="lp-nav-link"
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="lp-mobile-menu" aria-label="Mobile" className="lp-line border-t px-4 pb-4 pt-2 md:hidden">
          <ul className="flex flex-col">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="lp-nav-link block py-3" onClick={() => setOpen(false)}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">{account}</div>
        </nav>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Sample meeting shown in the previews. It is the same sample MeetCite's demo mode produces, so
 * the previews show what the product really outputs. Clearly labelled as sample data.
 * ---------------------------------------------------------------------------------------------- */
interface Line {
  id: number;
  time: string;
  speaker: string;
  text: string;
}

const LINES: Line[] = [
  {
    id: 0,
    time: "00:02",
    speaker: "Priya",
    text: "I'm Priya and I'm chairing today. We need to agree the launch date and the budget for the beta.",
  },
  {
    id: 1,
    time: "00:11",
    speaker: "Tom",
    text: "Testing found two bugs in the upload page that we still have to fix.",
  },
  {
    id: 3,
    time: "00:21",
    speaker: "Tom",
    text: "I will fix the upload bugs by Wednesday, so we could launch the following Monday.",
  },
  {
    id: 4,
    time: "00:28",
    speaker: "Sarah",
    text: "Marketing needs a week of notice. I can prepare the announcement email if the date is fixed today.",
  },
  { id: 5, time: "00:36", speaker: "Priya", text: "Then we have decided to launch the beta on Monday the 14th." },
  {
    id: 6,
    time: "00:41",
    speaker: "Sarah",
    text: "On budget, I suggest we keep it at five thousand pounds and review it after the first month.",
  },
  {
    id: 7,
    time: "00:48",
    speaker: "Priya",
    text: "Agreed. We agreed to keep the budget at five thousand pounds for now.",
  },
  {
    id: 8,
    time: "00:53",
    speaker: "Priya",
    text: "Sarah will draft the announcement email by Friday and share it with the team.",
  },
];

type Check = "supported" | "partial" | "unsupported";

const CHECK_PILL: Record<Check, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  supported: { cls: "lp-pill-ok", label: "Supported", Icon: CheckCircle2 },
  partial: { cls: "lp-pill-warn", label: "Partly supported", Icon: CircleHelp },
  unsupported: { cls: "lp-pill-bad", label: "Not supported", Icon: CircleAlert },
};

function CheckPill({ check }: { check: Check }) {
  const { cls, label, Icon } = CHECK_PILL[check];
  return (
    <span className={cn("lp-pill", cls)}>
      <Icon aria-hidden /> {label}
    </span>
  );
}

interface PreviewItem {
  text: string;
  meta?: string;
  cites: number[];
  check: Check;
}

const PREVIEW_TABS: { id: string; label: string; items: PreviewItem[] }[] = [
  {
    id: "summary",
    label: "Summary",
    items: [
      { text: "Two bugs in the upload page must be fixed before launch.", cites: [1], check: "supported" },
      { text: "The beta launch was set for Monday the 14th.", cites: [5], check: "supported" },
      { text: "The beta budget stays at £5,000, to be reviewed after a month.", cites: [6, 7], check: "supported" },
    ],
  },
  {
    id: "decisions",
    label: "Decisions",
    items: [
      { text: "Launch the beta on Monday the 14th.", cites: [5], check: "supported" },
      { text: "Keep the budget at five thousand pounds for now.", cites: [7], check: "supported" },
    ],
  },
  {
    id: "actions",
    label: "Action items",
    items: [
      { text: "Fix the upload bugs", meta: "Tom · by Wednesday", cites: [3], check: "supported" },
      { text: "Draft the announcement email", meta: "Sarah · by Friday", cites: [8], check: "supported" },
    ],
  },
];

function ProductPreview() {
  const [tab, setTab] = useState(PREVIEW_TABS[0]!.id);
  const [active, setActive] = useState<number[]>([5]);
  const items = PREVIEW_TABS.find((t) => t.id === tab)!.items;

  return (
    <figure className="lp-window" aria-label="Interactive preview of a MeetCite meeting page">
      <div className="lp-window-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="lp-muted ml-3 truncate text-xs">MeetCite · Beta launch planning</span>
        <span className="lp-pill lp-pill-info ml-auto">Sample data</span>
      </div>
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="lp-line border-b p-4 sm:p-5 md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Beta launch planning</p>
              <p className="lp-muted text-xs">3 speakers · 1 min · Completed</p>
            </div>
            <span className="lp-pill lp-pill-ok">
              <ShieldCheck aria-hidden /> AI check: 7 of 7 supported
            </span>
          </div>
          <div role="tablist" aria-label="Preview sections" className="mt-4 flex flex-wrap gap-1">
            {PREVIEW_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`lp-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="lp-tabpanel"
                className="lp-tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ul id="lp-tabpanel" role="tabpanel" aria-labelledby={`lp-tab-${tab}`} className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.text} className="lp-card p-3 shadow-none">
                <p className="text-sm font-medium">{item.text}</p>
                {item.meta && <p className="lp-muted mt-0.5 text-xs">{item.meta}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <CheckPill check={item.check} />
                  {item.cites.map((id) => {
                    const line = LINES.find((l) => l.id === id)!;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="lp-cite"
                        aria-pressed={active.includes(id)}
                        aria-label={`Show source at ${line.time}`}
                        onClick={() => setActive(item.cites)}
                      >
                        {line.time}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4 sm:p-5">
          <p className="lp-muted flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
            <FileSearch className="size-3.5" aria-hidden /> Transcript
          </p>
          <ol className="mt-2 space-y-1" aria-label="Sample transcript">
            {LINES.map((l) => (
              <li key={l.id} className="lp-line-row text-sm" data-active={active.includes(l.id)}>
                <span className="lp-muted mr-2 text-xs tabular-nums">{l.time}</span>
                <span className="font-semibold">{l.speaker}:</span> {l.text}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="sr-only">
        Select a timestamp next to a summary point to highlight the transcript lines it is based on.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------------------------------------ */
const FEATURES: { Icon: typeof Quote; title: string; text: string }[] = [
  {
    Icon: Quote,
    title: "Evidence-linked minutes",
    text: "Every key point, decision and action item cites the transcript lines it came from. Click a citation to jump to that moment and hear it.",
  },
  {
    Icon: ShieldCheck,
    title: "Automatic evidence check",
    text: "A second pass compares each claim with the text it cites and marks it supported, partly supported or not supported. Existing IDs alone are never treated as proof.",
  },
  {
    Icon: AudioLines,
    title: "Timestamped transcripts",
    text: "Speech is transcribed with Whisper into timestamped segments with speaker labels. Search across titles and transcripts.",
  },
  {
    Icon: ListChecks,
    title: "Decisions and actions",
    text: "Decisions, action items, owners and deadlines are recorded only when the transcript states them, so owners and dates aren't guessed.",
  },
  {
    Icon: Users,
    title: "Honest speaker labels",
    text: "Speakers are separated as Speaker 1, 2, 3. Real names come from a Teams or Zoom transcript file or from you, never from guesswork.",
  },
  {
    Icon: Pencil,
    title: "Human review and corrections",
    text: "Label any claim as supported, partial, unsupported, contradicted or unclear. Corrections keep the original AI text for the record.",
  },
  {
    Icon: GitCompare,
    title: "Baseline vs grounded comparison",
    text: "Generate a plain baseline summary and an evidence-grounded summary of the same meeting and compare them side by side.",
  },
  {
    Icon: Mic,
    title: "Upload or record",
    text: "Upload MP3, WAV, M4A, MP4 or WEBM files up to two hours, or record a call in the browser after confirming everyone has agreed.",
  },
];

const STEPS: { Icon: typeof Upload; title: string; text: string }[] = [
  { Icon: Upload, title: "Upload", text: "Add a recording. Its type, size and length are checked on the server." },
  {
    Icon: AudioLines,
    title: "Transcribe",
    text: "FFmpeg extracts the audio and Whisper writes a timestamped transcript.",
  },
  {
    Icon: ListChecks,
    title: "Analyse",
    text: "A local language model writes the minutes as structured JSON, citing line IDs.",
  },
  {
    Icon: ShieldCheck,
    title: "Verify evidence",
    text: "Citations are checked to exist, then each claim is compared with its source text.",
  },
  { Icon: Pencil, title: "Review", text: "Follow citations, label claims, correct mistakes and export the minutes." },
];

/* ------------------------------------------------------------------------------------------------ */
interface DemoClaim {
  claim: string;
  cites: number[];
  check: Check | "missing";
  why: string;
}

const DEMO: DemoClaim[] = [
  {
    claim: "The team decided to launch the beta on Monday the 14th.",
    cites: [5],
    check: "supported",
    why: "The cited line states the decision and the date exactly.",
  },
  {
    claim: "Tom will fix the upload bugs and the team will launch on Monday.",
    cites: [3],
    check: "partial",
    why: "Tom commits to the fix, but on this line the Monday launch is only a possibility, not yet agreed.",
  },
  {
    claim: "The budget was raised to ten thousand pounds.",
    cites: [7],
    check: "unsupported",
    why: "The cited line exists, but it says five thousand pounds. A valid citation is not proof. A reviewer would label this contradicted.",
  },
  {
    claim: "The launch could slip by a month.",
    cites: [],
    check: "missing",
    why: "No transcript line is cited, so the claim cannot be traced and is flagged for review instead of being hidden.",
  },
];

function EvidenceDemo() {
  const [selected, setSelected] = useState(0);
  const current = DEMO[selected]!;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <ul className="space-y-3" aria-label="Example claims">
        {DEMO.map((d, i) => (
          <li key={d.claim}>
            <button
              type="button"
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
              className={cn(
                "lp-card lp-card-hover w-full p-4 text-left",
                selected === i && "ring-2 ring-[color:var(--lp-accent)]",
              )}
            >
              <span className="block text-sm font-medium">{d.claim}</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {d.check === "missing" ? (
                  <span className="lp-pill lp-pill-bad">
                    <CircleAlert aria-hidden /> No evidence cited
                  </span>
                ) : (
                  <CheckPill check={d.check} />
                )}
                <span className="lp-pill lp-pill-info">
                  {d.cites.length ? `Cites line ${d.cites.join(", ")}` : "No citation"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="lp-card p-5 sm:p-6" aria-live="polite">
        <p className="lp-section-label">What the check sees</p>
        <p className="mt-3 text-base font-semibold">“{current.claim}”</p>
        {/* Re-keyed on every selection so the scan animation replays. */}
        <div key={selected} className="lp-scan mt-4 space-y-2 rounded-xl">
          {current.cites.length === 0 ? (
            <p className="lp-soft lp-muted rounded-xl p-4 text-sm">No transcript evidence was cited.</p>
          ) : (
            current.cites.map((id) => {
              const line = LINES.find((l) => l.id === id)!;
              return (
                <blockquote key={id} className="lp-soft rounded-xl p-4 text-sm">
                  <span className="lp-muted mr-2 text-xs tabular-nums">
                    [{id}] {line.time}
                  </span>
                  <span className="font-semibold">{line.speaker}:</span> {line.text}
                </blockquote>
              );
            })
          )}
        </div>
        <ol className="mt-5 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="lp-muted w-28 shrink-0">1. Exists?</span>
            <span>{current.cites.length ? "Yes, the cited line is in the transcript." : "Nothing to check."}</span>
          </li>
          <li className="flex gap-2">
            <span className="lp-muted w-28 shrink-0">2. Says this?</span>
            <span>{current.why}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="lp-muted w-28 shrink-0">3. Result</span>
            <span key={selected} className="lp-pop inline-flex">
              {current.check === "missing" ? (
                <span className="lp-pill lp-pill-bad">Requires review</span>
              ) : (
                <CheckPill check={current.check} />
              )}
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/** The spec sheet. Every figure is a real limit in the code or a measured result. */
function specs(processingTitle: string): { title: string; Icon: typeof Quote; rows: [string, string][] }[] {
  return [
    {
      title: "Input",
      Icon: Upload,
      rows: [
        ["Formats", "MP3, WAV, M4A, MP4 and WEBM"],
        ["Length", "Up to 2 hours per meeting, files up to 1 GB"],
        ["Ways in", "Upload a file, or record a Teams, Zoom or Google Meet call in the browser"],
        ["Language", "English"],
      ],
    },
    {
      title: "Speed",
      Icon: Timer,
      rows: [
        ["88-minute meeting", "About 3 minutes from upload to checked minutes (cloud AI)"],
        ["Transcription", "About 1½ minutes, speakers included"],
        ["Minutes", "Written in about 45 seconds; the evidence check in about 20"],
        ["While you wait", "Live progress, then a chime and a desktop notification"],
      ],
    },
    {
      title: "AI engines",
      Icon: Cpu,
      rows: [
        ["Cloud mode", "AssemblyAI for speech and speakers; Anthropic Claude for minutes and checks"],
        ["Local mode", "Whisper large-v3-turbo, pyannote and Llama 3.1 8B on your own GPU"],
        ["Configurations", "Evidence-grounded (C2) and a no-citation baseline (C1) to compare"],
        ["Currently", processingTitle],
      ],
    },
    {
      title: "What you get",
      Icon: ListChecks,
      rows: [
        ["Minutes", "Overview, key points, topic-by-topic minutes with who said what"],
        ["Outcomes", "Decisions, action items with owners and deadlines, open questions, risks"],
        ["Transcript", "Timestamped, searchable, with audio playback and corrections"],
        ["Export", "PDF, Word (DOCX) and plain text"],
      ],
    },
    {
      title: "Evidence",
      Icon: ShieldCheck,
      rows: [
        ["Citations", "Every claim links to the transcript lines it came from"],
        ["Automatic check", "Supported, partly supported or not supported, with a reason"],
        ["Human review", "Supported, partial, unsupported, contradicted or unclear"],
        ["Review queue", "Flagged claims first, with progress tracking"],
      ],
    },
    {
      title: "Speakers",
      Icon: Users,
      rows: [
        ["Separation", "Each voice labelled automatically (Speaker 1, 2, 3…)"],
        ["Real names", "From a Teams or Zoom transcript file, or rename in one click"],
        ["Suggestions", "Names people introduce themselves with are offered, never assumed"],
        ["Who said what", "Each speaker's position recorded per topic"],
      ],
    },
    {
      title: "Security & privacy",
      Icon: Lock,
      rows: [
        ["Accounts", "Argon2-hashed passwords, sign-in tokens that expire after 60 minutes"],
        ["Access", "Only you can open your meetings; recordings are never public files"],
        ["Protection", "Sign-in rate limiting and an optional sign-up code"],
        ["Control", "Delete a meeting and all its files at any time"],
      ],
    },
    {
      title: "Works on",
      Icon: MonitorSmartphone,
      rows: [
        ["Devices", "Any modern browser on desktop, tablet or phone"],
        ["Recording", "Chrome or Edge on a desktop computer"],
        ["Comfort", "Light and dark modes, keyboard friendly, reduced-motion support"],
        ["Accessibility", "Designed to WCAG 2.1 AA contrast"],
      ],
    },
  ];
}

type Provider = "local" | "cloud" | undefined;

/** Where recordings are processed - stated per the server's actual setting, never assumed. */
const PROCESSING: Record<"local" | "cloud" | "unknown", { title: string; text: string; faq: string }> = {
  local: {
    title: "Processed on the MeetCite server",
    text: "This MeetCite runs transcription (Whisper) and summarisation (Llama via Ollama) on its own server. Recordings are not sent to an AI company.",
    faq: "No. This MeetCite is set up to process recordings, transcripts and minutes with AI models running on its own server.",
  },
  cloud: {
    title: "Processed with trusted AI services",
    text: "This MeetCite sends the audio to AssemblyAI for transcription and the transcript to Anthropic's Claude for the minutes. Recordings are not public and are deleted with the meeting.",
    faq: "Yes, on this MeetCite. The audio is sent to AssemblyAI to transcribe and the transcript to Anthropic (Claude) to write and check the minutes. MeetCite can instead be set up to run everything on its own server.",
  },
  unknown: {
    title: "Local or cloud AI",
    text: "MeetCite can run its AI on its own server or with AssemblyAI and Claude. The administrator chooses, and this page shows which is in use.",
    faq: "It depends on how this MeetCite is set up: either everything runs on its own server, or the audio goes to AssemblyAI and the transcript to Anthropic (Claude).",
  },
};

const processing = (provider: Provider) => PROCESSING[provider ?? "unknown"];

const PRIVACY: { Icon: typeof Lock; title: string; text: string }[] = [
  {
    Icon: KeyRound,
    title: "Secure accounts",
    text: "Passwords are hashed with Argon2. Sign-in tokens are signed and expire after 60 minutes.",
  },
  {
    Icon: Lock,
    title: "Private by owner",
    text: "Every request checks that you own the meeting. Recordings are never public files; playback uses expiring links that work for one meeting only.",
  },
  {
    Icon: Trash2,
    title: "You can delete everything",
    text: "Deleting a meeting removes the recording, transcript, summaries and working files.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does “supported” mean?",
    a: "It means the automatic check found that the cited transcript lines state the claim. The check is itself an AI model and can be wrong, which is why every claim shows its evidence and can be reviewed by a person.",
  },
  {
    q: "Can MeetCite tell who said what?",
    a: "It separates different voices when speaker separation is enabled, and labels them Speaker 1, Speaker 2 and so on. That does not establish who a person is. Real names come from a Teams or Zoom transcript file, or from you renaming a speaker.",
  },
  {
    q: "Which files can I upload?",
    a: "MP3, WAV, M4A, MP4 and WEBM recordings of up to two hours. Files are checked on the server before processing starts.",
  },
  {
    q: "How long does processing take?",
    a: "It depends on the server's hardware. A progress bar shows each stage (audio, transcription, speakers, summary, evidence check) as it runs, and a failed stage can be retried without starting again.",
  },
  {
    q: "Can I correct mistakes?",
    a: "Yes. You can rename speakers, correct transcript lines, edit decisions and action items, and label claims. The original AI output is kept so corrections never erase the research record.",
  },
];

/* ------------------------------------------------------------------------------------------------
 * Motion graphics
 * ---------------------------------------------------------------------------------------------- */

/** A decorative voice waveform: bars rise and fall at different heights and speeds. */
function Waveform() {
  const bars = Array.from({ length: 56 }, (_, i) => {
    const peak = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
    return { peak, delay: -((i * 97) % 1400) / 1000, duration: 1 + ((i * 37) % 9) / 10 };
  });
  return (
    <div className="lp-wave" aria-hidden>
      {bars.map((b, i) => (
        <span
          key={i}
          style={
            {
              "--peak": b.peak.toFixed(2),
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const CAPABILITIES: [string, string][] = [
  ["Whisper transcription", "#fdba74"],
  ["Timestamped evidence", "#fb7185"],
  ["AI fact-check", "#34d399"],
  ["Decisions & actions", "#f472b6"],
  ["Real speaker names from Teams & Zoom", "#fbbf24"],
  ["Human claim review", "#e879f9"],
  ["Baseline vs grounded compare", "#fb923c"],
  ["Search every transcript", "#fda4af"],
  ["Export PDF · Word · text", "#fcd34d"],
  ["Local or cloud AI", "#f87171"],
];

/** Scrolling strip of what MeetCite does (its own capabilities, not customer logos). */
function CapabilityStrip() {
  const chips = (hidden: boolean) =>
    CAPABILITIES.map(([label, color]) => (
      <li key={label + hidden} className="lp-chip" aria-hidden={hidden || undefined}>
        <i style={{ "--chip": color } as CSSProperties} />
        {label}
      </li>
    ));
  return (
    <div className="lp-marquee border-t border-white/10 py-5">
      <ul className="lp-marquee-track" aria-label="What MeetCite does">
        {chips(false)}
        {chips(true)}
      </ul>
    </div>
  );
}

const HUES: [string, string][] = [
  ["var(--c-flame)", "var(--c-coral)"],
  ["var(--c-magenta)", "var(--c-rose)"],
  ["var(--c-coral)", "var(--c-peach)"],
  ["var(--c-rose)", "var(--c-tangerine)"],
  ["var(--c-gold)", "var(--c-rose)"],
  ["var(--c-peach)", "var(--c-flame)"],
  ["var(--c-plum)", "var(--c-magenta)"],
  ["var(--c-tangerine)", "var(--c-gold)"],
];

const hue = (i: number) => {
  const [a, b] = HUES[i % HUES.length]!;
  return { "--hue-a": a, "--hue-b": b } as CSSProperties;
};

/** Card with its own colour pair and a soft spotlight that follows the pointer. */
function Tile({ index, Icon, title, text }: { index: number; Icon: typeof Quote; title: string; text: string }) {
  return (
    <div
      className="lp-card lp-card-hover lp-tile p-6"
      style={hue(index)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      <span className="lp-icon">
        <Icon aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="lp-muted mt-2 text-sm leading-relaxed">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
export default function LandingPage() {
  const { user } = useAuth();
  const startHref = user ? "/upload" : "/register";
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000 });
  const where = processing(config.data?.ai_provider);
  const privacy = [{ Icon: ServerCog, title: where.title, text: where.text }, ...PRIVACY];
  const faq = [{ q: "Is my recording sent to a cloud AI service?", a: where.faq }, ...FAQ];

  return (
    <div className="lp min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      <Header />

      <main id="main">
        {/* Hero */}
        <section className="lp-hero lp-dark" aria-labelledby="hero-title">
          <div className="lp-photo" aria-hidden>
            {/* Photo by Julia Lopez on Unsplash (Unsplash License), credited in the footer. */}
            <img src={`${import.meta.env.BASE_URL}hero-woman-laptop.jpg`} alt="" fetchPriority="high" />
          </div>
          <div className="lp-aurora" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
            <div className="lp-hero-copy mx-auto max-w-3xl text-center">
              <Reveal>
                <span className="lp-eyebrow">
                  <span className="lp-live" aria-hidden />
                  Evidence-grounded AI meeting intelligence
                </span>
              </Reveal>
              <Reveal delay={60}>
                <h1 id="hero-title" className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
                  Turn Meetings Into <span className="lp-rainbow-text">Actionable Intelligence.</span>
                </h1>
              </Reveal>
              <Reveal delay={120}>
                <p className="lp-muted mx-auto mt-6 max-w-2xl text-lg leading-relaxed">
                  MeetCite transforms meeting recordings into searchable transcripts, summaries, decisions and action
                  items, each linked to the exact transcript evidence it came from, so you can check what the AI wrote.
                </p>
              </Reveal>
              <Reveal delay={180} className="mt-9 flex flex-wrap justify-center gap-3">
                <Link to={startHref} className="lp-btn lp-btn-primary">
                  Get Started <ArrowRight aria-hidden />
                </Link>
                <a href="#how-it-works" className="lp-btn lp-btn-ghost">
                  Explore How It Works
                </a>
              </Reveal>
              <Reveal delay={220} className="mt-10">
                <Waveform />
              </Reveal>
            </div>
            <Reveal delay={260} className="relative mx-auto mt-10 max-w-5xl">
              <span className="lp-float right-full top-16 mr-5" style={{ animationDelay: "-1s" }} aria-hidden>
                <CheckCircle2 className="text-emerald-400" /> Supported · 00:36
              </span>
              <span className="lp-float left-full top-40 ml-5" style={{ animationDelay: "-3s" }} aria-hidden>
                <ListChecks className="text-fuchsia-400" /> Decision found
              </span>
              <span className="lp-float bottom-20 right-full mr-5" style={{ animationDelay: "-4.5s" }} aria-hidden>
                <Users className="text-amber-300" /> Owner: Tom
              </span>
              <div className="lp-surface lp-halo">
                <ProductPreview />
              </div>
              <p className="lp-muted mt-4 text-center text-xs">
                Interactive preview with a sample meeting. Select a timestamp to see its source.
              </p>
            </Reveal>
          </div>
          <CapabilityStrip />
        </section>

        {/* Features */}
        <section id="features" className="lp-soft lp-wash scroll-mt-16 py-20 sm:py-24" aria-labelledby="features-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="lp-section-label">Features</p>
              <h2 id="features-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Minutes you can trace back to what was said
              </h2>
              <p className="lp-muted mt-4 text-lg">
                Most meeting summaries ask you to trust them. MeetCite shows its working.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 70}>
                  <Tile index={i} Icon={f.Icon} title={f.title} text={f.text} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Specs */}
        <section id="specs" className="lp-soft lp-wash scroll-mt-16 py-20 sm:py-24" aria-labelledby="specs-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="lp-section-label">Specs</p>
                <h2 id="specs-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Everything MeetCite can do, at a glance
                </h2>
                <p className="lp-muted mt-4 text-lg">
                  The formats it accepts, how fast it works, the AI behind it and what you get back.
                </p>
              </div>
              <div className="lp-surface">
                <BuddyWithMessage mood="idle" message="Here's what I can do for your meetings!" size={96} />
              </div>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {specs(where.title).map((group, i) => (
                <Reveal key={group.title} delay={(i % 4) * 70}>
                  <div className="lp-card lp-tile h-full p-6" style={hue(i)}>
                    <span className="lp-icon">
                      <group.Icon aria-hidden />
                    </span>
                    <h3 className="mt-4 font-semibold">{group.title}</h3>
                    <dl className="mt-3 space-y-2.5 text-sm">
                      {group.rows.map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--lp-accent)]">
                            {label}
                          </dt>
                          <dd className="lp-muted mt-0.5 leading-relaxed">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="lp-muted mt-6 text-xs">
              Speeds were measured on one 88-minute meeting recording in October 2026 and vary with recording length,
              server hardware and the AI services' load.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 py-20 sm:py-24" aria-labelledby="how-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="lp-section-label">How It Works</p>
              <h2 id="how-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                From recording to reviewed minutes in five steps
              </h2>
            </Reveal>
            <div className="relative mt-14">
              <span className="lp-steps-track" aria-hidden />
              <ol className="lp-steps grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
                {STEPS.map((s, i) => (
                  <Reveal as="li" key={s.title} delay={i * 80} className="relative text-center">
                    <span
                      className="lp-step-num relative mx-auto"
                      style={{ ...hue(i), "--delay": `${i * 0.9 + 0.3}s` } as CSSProperties}
                    >
                      {i + 1}
                    </span>
                    <h3 className="mt-4 flex items-center justify-center gap-2 font-semibold">
                      <s.Icon className="size-4" style={{ color: HUES[i % HUES.length]![0] }} aria-hidden /> {s.title}
                    </h3>
                    <p className="lp-muted mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed">{s.text}</p>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Evidence verification demo */}
        <section className="lp-soft py-20 sm:py-24" aria-labelledby="evidence-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="lp-section-label">Evidence verification</p>
              <h2 id="evidence-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                A citation is not proof until the text agrees
              </h2>
              <p className="lp-muted mt-4 text-lg">
                MeetCite checks that each cited line exists, then compares the meaning of the claim with that line. Weak
                claims are flagged, not hidden. Select an example.
              </p>
            </Reveal>
            <Reveal className="mt-10">
              <EvidenceDemo />
            </Reveal>
          </div>
        </section>

        {/* Research */}
        <section id="research" className="scroll-mt-16 py-20 sm:py-24" aria-labelledby="research-title">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <p className="lp-section-label">Research</p>
              <h2 id="research-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Does grounding make summaries more reliable?
              </h2>
              <p className="lp-muted mt-4 text-lg leading-relaxed">
                MeetCite is the software for an MSc study of evidence-grounded summarisation. It asks to what extent
                requiring every claim to cite transcript evidence improves the factual reliability and verifiability of
                meeting summaries, compared with a baseline that cites nothing.
              </p>
              <p className="lp-muted mt-4 text-sm">
                No results are shown here. Findings will be reported in the dissertation, with model versions, settings
                and hardware recorded for every run.
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              <Reveal className="lp-card p-6">
                <span className="lp-pill lp-pill-info">C1 · Baseline</span>
                <p className="mt-3 text-sm leading-relaxed">
                  Same model, same fields and the same transcript, but no instruction to cite evidence.
                </p>
              </Reveal>
              <Reveal delay={80} className="lp-card p-6">
                <span className="lp-pill lp-pill-ok">C2 · Evidence-grounded</span>
                <p className="mt-3 text-sm leading-relaxed">
                  Every claim must cite transcript line IDs, which are then checked automatically and by people.
                </p>
              </Reveal>
              <Reveal delay={160} className="lp-card p-6 sm:col-span-2">
                <p className="flex items-center gap-2 font-semibold">
                  <FlaskConical className="size-4 text-[color:var(--lp-accent2)]" aria-hidden /> What is measured
                </p>
                <ul className="lp-muted mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <li>Claim-level support rate</li>
                  <li>Unsupported and contradicted claim rate</li>
                  <li>Evidence-reference accuracy</li>
                  <li>Decision and action precision and recall</li>
                  <li>Agreement between human reviewers</li>
                  <li>Processing time and resource use</li>
                </ul>
                <p className="lp-muted mt-4 text-xs">
                  Evaluation uses the AMI Meeting Corpus and human claim labels collected in MeetCite.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Privacy and security */}
        <section className="lp-soft py-20 sm:py-24" aria-labelledby="privacy-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="lp-section-label">Privacy and security</p>
              <h2 id="privacy-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Built so meeting recordings stay private
              </h2>
              <p className="lp-muted mt-4 text-lg">These safeguards are implemented in the current version.</p>
            </Reveal>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {privacy.map((p, i) => (
                <Reveal key={p.title} delay={i * 70}>
                  <Tile index={i + 4} Icon={p.Icon} title={p.title} text={p.text} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 sm:py-24" aria-labelledby="faq-title">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal className="text-center">
              <p className="lp-section-label">FAQ</p>
              <h2 id="faq-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Frequently asked questions
              </h2>
            </Reveal>
            <div className="mt-10 space-y-3">
              {faq.map((f) => (
                <details key={f.q} className="lp-faq lp-card p-0">
                  <summary className="flex items-center justify-between gap-4 p-5 font-medium">
                    {f.q}
                    <Plus className="chev size-5 shrink-0 text-[color:var(--lp-accent)]" aria-hidden />
                  </summary>
                  <p className="lp-muted px-5 pb-5 text-sm leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* About + final call to action */}
        <section id="about" className="scroll-mt-16 pb-20 sm:pb-24" aria-labelledby="about-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="lp-window lp-cta relative overflow-hidden p-8 sm:p-12">
              <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="lp-section-label">About</p>
                  <h2 id="about-title" className="mt-3 text-3xl font-bold tracking-tight">
                    An MSc research project
                  </h2>
                  <p className="lp-muted mt-4 leading-relaxed">
                    MeetCite was built by Olayinka Williams Ajibola for the MSc Information Technology programme at the
                    University of the West of Scotland. It is a research prototype for studying how AI meeting summaries
                    can be made checkable, not a commercial service.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                  <Link to={startHref} className="lp-btn lp-btn-primary">
                    {user ? "Upload a meeting" : "Get Started"} <ArrowRight aria-hidden />
                  </Link>
                  {!user && (
                    <Link to="/login" className="lp-btn lp-btn-ghost">
                      Sign In
                    </Link>
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="lp-line border-t">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="lp-muted mt-3 max-w-sm text-sm">
              Evidence-grounded AI meeting intelligence. MSc Information Technology project, University of the West of
              Scotland.
            </p>
          </div>
          <nav aria-label="Footer: product">
            <p className="text-sm font-semibold">Product</p>
            <ul className="lp-muted mt-3 space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="hover:text-[color:var(--lp-accent)]">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Footer: account">
            <p className="text-sm font-semibold">Account</p>
            <ul className="lp-muted mt-3 space-y-2 text-sm">
              {user ? (
                <li>
                  <Link to="/" className="hover:text-[color:var(--lp-accent)]">
                    My meetings
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login" className="hover:text-[color:var(--lp-accent)]">
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className="hover:text-[color:var(--lp-accent)]">
                      Create an account
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
        <div className="lp-line lp-muted border-t py-5 text-center text-xs">
          Research prototype · © {new Date().getFullYear()} Olayinka Williams Ajibola · Hero photo by{" "}
          <a
            className="underline underline-offset-2"
            href="https://unsplash.com/photos/woman-wearing-headphones-works-on-a-laptop-by-window-NLuDzsdyQ6M"
            target="_blank"
            rel="noreferrer"
          >
            Julia Lopez on Unsplash
          </a>
        </div>
      </footer>
    </div>
  );
}

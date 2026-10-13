import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Circle, Home, LogOut, Moon, Plus, Sun } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  announceMeeting,
  askForNotifications,
  playChime,
  setSoundEnabled,
  soundEnabled,
  unlockAudio,
} from "@/lib/notify";
import { useTheme } from "@/lib/theme";
import type { MeetingStatusValue } from "@/lib/types";
import { Button } from "./ui/button";

const isBusy = (s: MeetingStatusValue) => s === "queued" || s === "processing";

/**
 * Watches the user's meetings from every app page and chimes (plus a desktop notification when
 * the tab is in the background) the moment one finishes processing or fails.
 */
function useCompletionAlerts() {
  const navigate = useNavigate();
  const previous = useRef<Map<number, MeetingStatusValue>>();
  const meetings = useQuery({
    queryKey: ["meetings", "__watch"],
    queryFn: () => api.listMeetings(),
    refetchInterval: (q) => (q.state.data?.some((m) => isBusy(m.status)) ? 3000 : 15000),
  });

  useEffect(() => {
    if (!meetings.data) return;
    const before = previous.current;
    if (before) {
      for (const m of meetings.data) {
        const was = before.get(m.id);
        if (was && isBusy(was) && (m.status === "completed" || m.status === "failed")) {
          announceMeeting(m.title, m.status === "completed", () => navigate(`/meetings/${m.id}`));
        }
      }
    }
    previous.current = new Map(meetings.data.map((m) => [m.id, m.status]));
  }, [meetings.data, navigate]);

  // Browsers only play sound after the user has interacted with the page.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);
}

function SoundToggle() {
  const [on, setOn] = useState(soundEnabled);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-pressed={on}
      aria-label={on ? "Mute the ready chime" : "Turn on the ready chime"}
      title={on ? "Chime when a meeting is ready: on" : "Chime when a meeting is ready: off"}
      onClick={() => {
        const next = !on;
        setOn(next);
        setSoundEnabled(next);
        if (next) {
          playChime("success"); // a preview of the sound
          void askForNotifications();
        }
      }}
    >
      {on ? <Bell /> : <BellOff />}
    </Button>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <g className="fill-primary-foreground">
          <rect x="7" y="13" width="3" height="6" rx="1.5" />
          <rect x="12" y="9" width="3" height="14" rx="1.5" />
          <rect x="17" y="6" width="3" height="20" rx="1.5" />
          <rect x="22" y="11" width="3" height="10" rx="1.5" />
        </g>
      </svg>
      MeetMind
    </span>
  );
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  useCompletionAlerts();
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        {/* Thin sunset stripe linking the app to the landing page's palette. */}
        <div className="h-1 bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500" aria-hidden />
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <Link to="/" aria-label="MeetMind home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <Button asChild size="sm" variant="ghost">
              <Link to="/welcome" aria-label="MeetMind home page">
                <Home /> <span className="hidden md:inline">Home</span>
              </Link>
            </Button>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/upload">
                <Plus /> Upload
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
              <Link to="/record">
                <Circle className="fill-red-600 text-red-600" /> Record
              </Link>
            </Button>
            <SoundToggle />
            <ThemeToggle />
            <span className="hidden px-2 text-sm text-muted-foreground md:inline">{user?.name}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Log out"
              onClick={() => {
                signOut();
                navigate("/login");
              }}
            >
              <LogOut />
            </Button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

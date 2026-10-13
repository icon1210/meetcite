/**
 * "Your meeting is ready" alerts: a short chime (made with the Web Audio API, so there is no
 * sound file to download), a desktop notification when the tab is in the background, and a
 * mark in the tab title until the user comes back.
 */

const SOUND_KEY = "meetcite-sound";
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

/** Browsers only allow sound after a user gesture; call this from any click to prepare audio. */
export function unlockAudio(): void {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
}

/** A soft rising three-note chime for success, a gentle falling pair for failure. */
export function playChime(kind: "success" | "error" = "success"): void {
  if (!soundEnabled()) return;
  unlockAudio();
  if (!ctx) return;
  const notes = kind === "success" ? [784, 988, 1319] : [523, 392]; // G5 B5 E6 / C5 G4
  const start = ctx.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const t = start + i * 0.14;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + 1);
  });
}

export function notificationsAvailable(): boolean {
  return typeof Notification !== "undefined";
}

export async function askForNotifications(): Promise<void> {
  if (notificationsAvailable() && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* the user dismissed the prompt */
    }
  }
}

let baseTitle = "";

function markTitle(mark: string): void {
  if (!document.hidden) return;
  baseTitle ||= document.title.replace(/^[✓✕] /, "");
  document.title = `${mark} ${baseTitle}`;
  const restore = () => {
    if (!document.hidden) {
      document.title = baseTitle;
      baseTitle = "";
      document.removeEventListener("visibilitychange", restore);
    }
  };
  document.addEventListener("visibilitychange", restore);
}

/** Tell the user a meeting finished processing (or failed). */
export function announceMeeting(title: string, ok: boolean, onOpen?: () => void): void {
  playChime(ok ? "success" : "error");
  // Lets Mindy (components/Buddy.tsx) celebrate or look sorry wherever she is on screen.
  window.dispatchEvent(new CustomEvent("meetcite:announce", { detail: { ok, title } }));
  markTitle(ok ? "✓" : "✕");
  if (document.hidden && notificationsAvailable() && Notification.permission === "granted") {
    try {
      const n = new Notification(ok ? "Your meeting is ready" : "Processing failed", {
        body: ok ? `${title}: transcript and minutes are ready to review.` : `${title}: open MeetCite to retry.`,
        icon: "/favicon.svg",
        tag: `meetcite-${title}`,
      });
      n.onclick = () => {
        window.focus();
        onOpen?.();
        n.close();
      };
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}

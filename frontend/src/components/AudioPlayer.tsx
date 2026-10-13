import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { apiUrl } from "@/lib/api";
import type { MediaInfo } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "./ui/button";
import { Select } from "./ui/form";

export interface AudioPlayerHandle {
  seekTo: (seconds: number, play?: boolean) => void;
}

function cssColour(variable: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `hsl(${v} / ${alpha})` : "#888";
}

/**
 * Waveform audio player (FR10). The audio streams from the server through a
 * normal <audio> element; the waveform is drawn from server-computed peaks so
 * long recordings never have to be decoded in the browser.
 */
export const AudioPlayer = forwardRef<AudioPlayerHandle, { media: MediaInfo; onTime?: (t: number) => void }>(
  function AudioPlayer({ media, onTime }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(media.duration_s ?? 0);
    const [rate, setRate] = useState("1");
    const onTimeRef = useRef(onTime);
    onTimeRef.current = onTime;

    useEffect(() => {
      if (!containerRef.current || !audioRef.current) return;
      const hasPeaks = media.peaks.length > 0 && media.duration_s;
      const ws = WaveSurfer.create({
        container: containerRef.current,
        media: audioRef.current,
        height: 64,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        waveColor: cssColour("--muted-foreground", 0.45),
        progressColor: cssColour("--primary"),
        cursorColor: cssColour("--ring"),
        ...(hasPeaks ? { peaks: [media.peaks], duration: media.duration_s! } : {}),
      });
      wsRef.current = ws;
      const subs = [
        ws.on("play", () => setPlaying(true)),
        ws.on("pause", () => setPlaying(false)),
        ws.on("ready", (d) => setDuration(d)),
        ws.on("timeupdate", (t) => {
          setTime(t);
          onTimeRef.current?.(t);
        }),
      ];
      return () => {
        subs.forEach((unsub) => unsub());
        ws.destroy();
        wsRef.current = null;
      };
    }, [media]);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds, play = true) => {
        const ws = wsRef.current;
        if (!ws) return;
        ws.setTime(seconds);
        if (play) void ws.play();
      },
    }));

    const skip = (delta: number) => wsRef.current?.setTime(Math.max(0, (wsRef.current?.getCurrentTime() ?? 0) + delta));

    return (
      <div className="space-y-2">
        <audio ref={audioRef} src={apiUrl(media.url)} preload="metadata" className="hidden" />
        <div ref={containerRef} className="w-full cursor-pointer" aria-label="Audio waveform. Click to seek." />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => skip(-10)} aria-label="Back 10 seconds">
            <RotateCcw />
          </Button>
          <Button size="icon" onClick={() => void wsRef.current?.playPause()} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => skip(10)} aria-label="Forward 10 seconds">
            <RotateCw />
          </Button>
          <span className="tabular-nums text-sm text-muted-foreground" aria-live="off">
            {formatTimestamp(time)} / {formatTimestamp(duration)}
          </span>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            Speed
            <Select
              className="h-8 w-20"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                wsRef.current?.setPlaybackRate(Number(e.target.value));
              }}
            >
              {["0.75", "1", "1.25", "1.5", "2"].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    );
  },
);

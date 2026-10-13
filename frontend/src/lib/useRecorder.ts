import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "starting" | "recording" | "stopped";

export interface RecorderOptions {
  /** Capture the call: the other participants' voices, from a shared tab or the whole screen. */
  callAudio: boolean;
  /** Capture the user's own voice from their microphone. */
  microphone: boolean;
}

export class RecorderError extends Error {}

function pickMimeType(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function recordingSupported(): { ok: boolean; callAudio: boolean; reason?: string } {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia || typeof MediaRecorder === "undefined") {
    return { ok: false, callAudio: false, reason: "This browser cannot record audio. Use Chrome or Edge." };
  }
  return { ok: true, callAudio: typeof md.getDisplayMedia === "function" };
}

/**
 * An AudioWorklet that turns the mixed recording into 16 kHz, 16-bit mono PCM chunks of ~100 ms,
 * the format AssemblyAI's live captions expect. Loaded from a Blob, so there is no extra file.
 */
const PCM_WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.acc = 0; this.n = 0; this.out = []; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.n++; this.pos++;
      if (this.pos >= this.ratio) { this.pos -= this.ratio; this.out.push(this.acc / this.n); this.acc = 0; this.n = 0; }
    }
    if (this.out.length >= 1600) {
      const pcm = new Int16Array(this.out.length);
      for (let i = 0; i < this.out.length; i++) { const s = Math.max(-1, Math.min(1, this.out[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
      this.port.postMessage(pcm, [pcm.buffer]);
      this.out = [];
    }
    return true;
  }
}
registerProcessor("pcm16", Pcm16);
`;

/**
 * Records a meeting in the browser (spec §14). The call audio comes from screen/tab sharing
 * (getDisplayMedia) and the user's voice from the microphone (getUserMedia); the Web Audio API
 * mixes them into one track, which MediaRecorder saves as WebM/Opus. With `onPcm`, the same mix
 * is also delivered as 16 kHz PCM for live captions.
 */
export function useRecorder(maxSeconds: number, onPcm?: (chunk: Int16Array) => void) {
  // Kept in a ref so a new callback (e.g. after live captions connect) is used without restarting.
  const onPcmRef = useRef(onPcm);
  onPcmRef.current = onPcm;
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAt = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    void ctxRef.current?.close();
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(
    async ({ callAudio, microphone }: RecorderOptions) => {
      if (!callAudio && !microphone) throw new RecorderError("Choose at least one audio source.");
      setState("starting");
      setWarning(null);
      setBlob(null);
      const streams: MediaStream[] = [];
      try {
        if (callAudio) {
          // Video must be requested for the sharing dialog to appear; only the audio is recorded.
          const display = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
          streams.push(display);
          if (display.getAudioTracks().length === 0) {
            throw new RecorderError(
              'No call audio was shared. Start again and, in the sharing window, choose the meeting tab or "Entire screen" and switch on "Share tab audio" / "Share system audio".',
            );
          }
          // If the user presses the browser's "Stop sharing" button, finish the recording.
          display.getVideoTracks()[0]?.addEventListener("ended", () => stop());
        }
        if (microphone) {
          streams.push(
            await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            }),
          );
        }
      } catch (err) {
        streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        setState("idle");
        if (err instanceof RecorderError) throw err;
        const name = (err as DOMException)?.name;
        throw new RecorderError(
          name === "NotAllowedError"
            ? "Permission was refused. Allow microphone or screen sharing in the browser and try again."
            : name === "NotFoundError"
              ? "No microphone was found."
              : `Could not start recording: ${(err as Error).message}`,
        );
      }
      streamsRef.current = streams;

      // Mix all sources into one track.
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      // Live captions: tap the same mix as 16 kHz PCM. If the browser can't, recording carries on without.
      let pcmNode: AudioWorkletNode | null = null;
      if (onPcmRef.current && ctx.audioWorklet) {
        try {
          const url = URL.createObjectURL(new Blob([PCM_WORKLET], { type: "application/javascript" }));
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          pcmNode = new AudioWorkletNode(ctx, "pcm16", { channelCount: 1, channelCountMode: "explicit" });
          pcmNode.port.onmessage = (e: MessageEvent<Int16Array>) => onPcmRef.current?.(e.data);
          const silent = ctx.createGain();
          silent.gain.value = 0; // the worklet must be connected to run, but nothing should play aloud
          pcmNode.connect(silent).connect(ctx.destination);
        } catch {
          pcmNode = null;
        }
      }
      for (const s of streams) {
        if (s.getAudioTracks().length === 0) continue;
        const src = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
        src.connect(dest);
        src.connect(analyser);
        if (pcmNode) src.connect(pcmNode);
      }
      const samples = new Uint8Array(analyser.fftSize);
      const meter = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const v of samples) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(peak);
        rafRef.current = requestAnimationFrame(meter);
      };
      meter();

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : {});
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        setBlob(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        setState("stopped");
        cleanup();
      };
      recorderRef.current = recorder;
      recorder.start(1000); // save a chunk every second, so a crash loses little
      startedAt.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(secs);
        if (secs >= maxSeconds) {
          setWarning("The recording reached the maximum length and was stopped.");
          stop();
        }
      }, 500);
      setState("recording");
    },
    [cleanup, maxSeconds, stop],
  );

  const reset = useCallback(() => {
    setBlob(null);
    setElapsed(0);
    setState("idle");
  }, []);

  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      cleanup();
    },
    [cleanup],
  );

  return { state, elapsed, level, blob, warning, start, stop, reset };
}

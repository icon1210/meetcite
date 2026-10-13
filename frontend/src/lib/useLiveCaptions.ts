import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export interface CaptionTurn {
  order: number;
  text: string;
  final: boolean;
}

export type LiveStatus = "off" | "connecting" | "live" | "ended" | "error";

/** Merge one streaming "Turn" message into the list (a turn is updated in place until it ends). */
export function applyTurn(
  turns: CaptionTurn[],
  msg: { turn_order: number; transcript: string; end_of_turn: boolean; turn_is_formatted?: boolean },
): CaptionTurn[] {
  if (!msg.transcript) return turns;
  // With formatting on, the final version of a turn arrives as a second, formatted message.
  const final = msg.end_of_turn && msg.turn_is_formatted !== false;
  const next = turns.filter((t) => t.order !== msg.turn_order);
  next.push({ order: msg.turn_order, text: msg.transcript, final });
  return next.sort((a, b) => a.order - b.order);
}

/**
 * Live captions from AssemblyAI's real-time service. The server issues a short-lived token; the
 * browser streams 16 kHz PCM (from useRecorder's onPcm) over a WebSocket and receives turns.
 */
export function useLiveCaptions() {
  const [status, setStatus] = useState<LiveStatus>("off");
  const [turns, setTurns] = useState<CaptionTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  const start = useCallback(async () => {
    setTurns([]);
    setError(null);
    setStatus("connecting");
    try {
      const { token, websocket_url } = await api.liveToken();
      const socket = new WebSocket(`${websocket_url}&token=${encodeURIComponent(token)}`);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => setStatus("live");
      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "Turn") setTurns((t) => applyTurn(t, msg));
        else if (msg.type === "Termination") setStatus("ended");
        else if (msg.error) {
          setError(String(msg.error));
          setStatus("error");
        }
      };
      socket.onerror = () => {
        setError("Live captions lost their connection. The recording itself is unaffected.");
        setStatus("error");
      };
      socket.onclose = () => setStatus((s) => (s === "error" ? s : "ended"));
      ws.current = socket;
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  /** Pass to useRecorder: each ~100 ms of audio goes straight to the captioning service. */
  const sendAudio = useCallback((chunk: Int16Array) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(chunk.buffer);
  }, []);

  const stop = useCallback(() => {
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "Terminate" }));
      window.setTimeout(() => socket.close(), 1500);
    }
    ws.current = null;
  }, []);

  useEffect(() => () => ws.current?.close(), []);

  return { status, turns, error, start, stop, sendAudio };
}

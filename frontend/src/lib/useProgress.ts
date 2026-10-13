import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, openProgressSocket } from "./api";
import type { MeetingStatus } from "./types";

/**
 * Live job progress (FR3). Uses the WebSocket stream, and falls back to
 * polling /status every two seconds if the socket cannot connect.
 */
export function useProgress(meetingId: number, active: boolean): MeetingStatus | undefined {
  const [live, setLive] = useState<MeetingStatus>();
  const [socketFailed, setSocketFailed] = useState(false);

  useEffect(() => {
    if (!active || typeof WebSocket === "undefined") return;
    setSocketFailed(false);
    let gotMessage = false;
    const ws = openProgressSocket(meetingId);
    ws.onmessage = (e) => {
      gotMessage = true;
      setLive(JSON.parse(e.data) as MeetingStatus);
    };
    ws.onerror = () => setSocketFailed(true);
    ws.onclose = () => {
      if (!gotMessage) setSocketFailed(true);
    };
    return () => ws.close();
  }, [meetingId, active]);

  const polled = useQuery({
    queryKey: ["status", meetingId],
    queryFn: () => api.getStatus(meetingId),
    enabled: active && socketFailed,
    refetchInterval: 2000,
  });

  return socketFailed ? polled.data : live;
}

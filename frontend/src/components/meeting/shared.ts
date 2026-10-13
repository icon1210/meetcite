import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeetingDetail, Segment } from "@/lib/types";

export interface TabProps {
  meeting: MeetingDetail;
  segmentsByPosition: Map<number, Segment>;
  onJump: (ids: number[]) => void;
}

/** A mutation that refreshes the meeting after it succeeds. */
export function useMeetingMutation<V, R = unknown>(meetingId: number, fn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting", meetingId] }),
  });
}

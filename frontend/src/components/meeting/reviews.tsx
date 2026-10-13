import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { ClaimReview, MeetingDetail, ReviewLabel } from "@/lib/types";

/** Identifies a claim for human review. `key` matches the server's claim_key. */
export interface ClaimRef {
  type: "decision" | "action" | "point" | "topic" | "position" | "question" | "risk";
  /** Path in the review URL: a number, or "summaryId:path" for items stored inside a summary. */
  id: string;
  key: string;
}

export const claimRef = {
  decision: (id: number): ClaimRef => ({ type: "decision", id: String(id), key: `decision:${id}` }),
  action: (id: number): ClaimRef => ({ type: "action", id: String(id), key: `action:${id}` }),
  /** For items inside a summary, e.g. path "point:0" or "topic:1:position:0". */
  inSummary: (type: ClaimRef["type"], summaryId: number, path: string): ClaimRef => ({
    type,
    id: `${summaryId}:${path}`,
    key: `summary:${summaryId}:${path}`,
  }),
};

interface ReviewState {
  reviewFor: (key: string) => ClaimReview | undefined;
  submit: (claim: ClaimRef, label: ReviewLabel) => void;
  pendingKey: string | null;
}

const ReviewContext = createContext<ReviewState | null>(null);

export function ReviewProvider({ meeting, children }: { meeting: MeetingDetail; children: ReactNode }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ claim, label }: { claim: ClaimRef; label: ReviewLabel }) =>
      api.reviewClaim(claim.type, claim.id, label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting", meeting.id] }),
  });
  const value = useMemo<ReviewState>(() => {
    const byKey = new Map(meeting.reviews.map((r) => [r.claim_key, r]));
    return {
      reviewFor: (key) => byKey.get(key),
      submit: (claim, label) => mutation.mutate({ claim, label }),
      pendingKey: mutation.isPending ? (mutation.variables?.claim.key ?? null) : null,
    };
  }, [meeting.reviews, mutation]);
  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export function useReviews(): ReviewState | null {
  return useContext(ReviewContext);
}

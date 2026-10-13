import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import type { MeetingStatusValue } from "@/lib/types";
import { Badge, Spinner } from "./ui/misc";

export function StatusBadge({ status }: { status: MeetingStatusValue }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden /> Ready
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <CircleAlert className="size-3.5" aria-hidden /> Failed
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="accent">
          <Spinner className="size-3" /> Processing
        </Badge>
      );
    default:
      return (
        <Badge>
          <Clock className="size-3.5" aria-hidden /> Queued
        </Badge>
      );
  }
}

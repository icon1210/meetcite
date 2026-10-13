import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";

/** A short reassurance under the upload buttons. The full details are on the landing page's privacy section. */
export function PrivacyNote() {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const where =
    config.data?.ai_provider === "cloud"
      ? "processed securely with our trusted AI partners"
      : "processed on MeetCite's own server";
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" aria-hidden />
      Private to your account, {where}. You can delete it at any time.
    </p>
  );
}

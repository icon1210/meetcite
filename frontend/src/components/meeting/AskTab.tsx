import { useMutation } from "@tanstack/react-query";
import { MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Alert, Card, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { AskResponse } from "@/lib/types";
import { SourceLinks } from "../SourceLinks";
import type { TabProps } from "./shared";

const EXAMPLES = [
  "What was decided about the budget?",
  "Who is responsible for the next steps?",
  "What are the open risks?",
];

/** Ask questions about the meeting in plain English (FR16). */
export function AskTab({ meeting, segmentsByPosition, onJump }: TabProps) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ q: string; a: AskResponse }[]>([]);
  const ask = useMutation({
    mutationFn: (q: string) => api.ask(meeting.id, q),
    onSuccess: (a, q) => {
      setHistory((h) => [{ q, a }, ...h]);
      setQuestion("");
    },
  });

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim().length >= 3) ask.mutate(question.trim());
        }}
      >
        <Label htmlFor="ask">Ask a question about this meeting</Label>
        <div className="flex gap-2">
          <Input
            id="ask"
            value={question}
            maxLength={500}
            placeholder="e.g. When is the launch?"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" disabled={ask.isPending || question.trim().length < 3}>
            {ask.isPending ? <Spinner /> : <MessageCircleQuestion />} Ask
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-accent"
              onClick={() => setQuestion(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {ask.isError && <Alert variant="destructive">{(ask.error as Error).message}</Alert>}

      <div aria-live="polite" className="space-y-3">
        {history.map(({ q, a }, i) => (
          <Card key={history.length - i} className="space-y-2 p-4">
            <p className="text-sm font-medium">{q}</p>
            <p className="whitespace-pre-wrap leading-relaxed">{a.answer}</p>
            <SourceLinks
              ids={a.source_segment_ids}
              hasSource={a.source_segment_ids.length > 0}
              segmentsByPosition={segmentsByPosition}
              onJump={onJump}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

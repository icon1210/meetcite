import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { participation } from "@/components/meeting/InsightsTab";
import { SourceLinks } from "@/components/SourceLinks";
import { VerdictBadge } from "@/components/Verdict";
import type { MeetingDetail, MeetingStatus, Segment } from "@/lib/types";

const segments = new Map<number, Segment>([
  [3, { id: 10, position: 3, speaker_id: 1, start_s: 42, end_s: 50, text: "We agreed.", original_text: null }],
]);

describe("SourceLinks", () => {
  it("jumps to the cited segment", async () => {
    const onJump = vi.fn();
    render(<SourceLinks ids={[3]} hasSource segmentsByPosition={segments} onJump={onJump} />);
    await userEvent.click(screen.getByRole("button", { name: /go to transcript at 0:42/i }));
    expect(onJump).toHaveBeenCalledWith([3]);
  });

  it("warns when a point has no valid source", () => {
    render(<SourceLinks ids={[]} hasSource={false} segmentsByPosition={segments} onJump={vi.fn()} />);
    expect(screen.getByText(/no source found/i)).toBeInTheDocument();
  });
});

const base: MeetingStatus = {
  meeting_id: 1,
  status: "processing",
  stage: "diarizing",
  progress_pct: 60,
  error: null,
  warnings: [],
};

describe("VerdictBadge", () => {
  it("shows the reason when a point is not supported", () => {
    render(<VerdictBadge verdict="unsupported" note="The transcript never mentions Paris." />);
    expect(screen.getByText("AI check: not supported")).toBeInTheDocument();
    expect(screen.getByText("The transcript never mentions Paris.")).toBeInTheDocument();
  });

  it("keeps verified points compact", () => {
    render(<VerdictBadge verdict="supported" note="All details found." />);
    expect(screen.getByText("AI check: supported")).toBeInTheDocument();
    expect(screen.queryByText("All details found.")).not.toBeInTheDocument();
  });
});

describe("participation", () => {
  it("counts talk time, turns and questions per speaker", () => {
    const meeting = {
      speakers: [
        { id: 1, label: "SPEAKER_00", display_name: "Ana" },
        { id: 2, label: "SPEAKER_01", display_name: "Ben" },
      ],
      segments: [
        { id: 1, position: 0, speaker_id: 1, start_s: 0, end_s: 30, text: "Long intro. Any questions?" },
        { id: 2, position: 1, speaker_id: 1, start_s: 31, end_s: 40, text: "More from me." },
        { id: 3, position: 2, speaker_id: 2, start_s: 40, end_s: 50, text: "Yes, one." },
      ],
    } as unknown as MeetingDetail;
    const [ana, ben] = participation(meeting);
    expect(ana).toMatchObject({ name: "Ana", seconds: 39, turns: 1, questions: 1 });
    expect(ben).toMatchObject({ name: "Ben", seconds: 10, turns: 1, words: 2 });
  });
});

describe("ProcessingPanel", () => {
  it("shows completed and active stages", () => {
    render(<ProcessingPanel status={base} onRetry={vi.fn()} retrying={false} />);
    const stages = screen.getByRole("list", { name: "Processing stages" });
    expect(stages).toHaveTextContent("Transcribing (done)");
    expect(stages).toHaveTextContent("Identifying speakers (in progress)");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("offers retry when the job failed", async () => {
    const onRetry = vi.fn();
    render(
      <ProcessingPanel
        status={{ ...base, status: "failed", error: "FFmpeg was not found." }}
        onRetry={onRetry}
        retrying={false}
      />,
    );
    // Mindy delivers the error in an alert bubble, so screen readers announce it at once.
    expect(screen.getByRole("alert")).toHaveTextContent("FFmpeg was not found.");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

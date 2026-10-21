// Mirrors the backend's Pydantic response models (backend/app/schemas.py).

/** llm = C2 evidence-grounded, baseline = C1 plain prompt, bart = C3, cloud = optional cloud LLM. */
export type Summarizer = "llm" | "baseline" | "bart" | "cloud";
/** Did the AI cite real transcript lines? (spec §15) "user" = written by the user. */
export type EvidenceStatus = "valid" | "missing" | "invalid" | "user";
/** The human factual-support rubric (spec §21). */
export type ReviewLabel = "supported" | "partial" | "unsupported" | "contradicted" | "unclear";
export type MeetingStatusValue = "queued" | "processing" | "completed" | "failed";

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface MeetingListItem {
  id: number;
  title: string;
  duration_s: number | null;
  status: MeetingStatusValue;
  model_used: Summarizer;
  source: "upload" | "browser";
  created_at: string;
  // At-a-glance figures for the dashboard.
  stage: string | null;
  progress_pct: number;
  overview: string;
  speaker_count: number;
  decision_count: number;
  open_action_count: number;
  flagged_count: number;
  /** Flagged claims the owner hasn't reviewed yet (0 for the plain C1 version). */
  review_needed_count: number;
  /** Decisions that changed compared with earlier meetings in the series. */
  change_count: number;
  series_id: number | null;
  series_name: string | null;
}

// --- Project memory --------------------------------------------------------------------------
export interface Contradiction {
  previous_meeting_id: number;
  previous_meeting_title: string;
  previous_meeting_date: string;
  previous_decision: string;
  previous_source_ids: number[];
  current: string;
  source_segment_ids: number[];
  note: string;
  /** Present in series views: the meeting where the change was noticed. */
  meeting_id?: number;
  meeting_title?: string;
  meeting_date?: string;
}

export interface ProgressHint {
  action_id: number;
  meeting_id: number;
  meeting_title: string;
  task: string;
  owner: string | null;
  status: "done" | "in_progress";
  current: string;
  source_segment_ids: number[];
  note: string;
}

export interface Continuity {
  method?: string;
  contradictions?: Contradiction[];
  progress?: ProgressHint[];
}

export interface AgendaItemReview {
  item: string;
  status: "covered" | "partly" | "not_covered";
  topics: string[];
  source_segment_ids: number[];
  note: string;
}

export interface AgendaReview {
  method?: string;
  items?: AgendaItemReview[];
  unplanned?: string[];
}

export interface Series {
  id: number;
  name: string;
  created_at: string;
  meeting_count: number;
  open_action_count: number;
  last_meeting_at: string | null;
}

export interface SeriesAction {
  id: number;
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  task: string;
  owner: string | null;
  deadline: string | null;
  status: "open" | "done";
  source_segment_ids: number[];
  verdict: string;
}

export interface SeriesDecision {
  id: number;
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  text: string;
  source_segment_ids: number[];
  verdict: string;
}

export interface SeriesDetail extends Series {
  meetings: MeetingListItem[];
  actions: SeriesAction[];
  decisions: SeriesDecision[];
  contradictions: Contradiction[];
  progress: (ProgressHint & { meeting_date?: string })[];
}

export interface SeriesSource {
  meeting_id: number;
  meeting_title: string;
  position: number;
  start_s: number;
  speaker: string;
  text: string;
}

export interface Job {
  stage: string;
  progress_pct: number;
  error: string | null;
  warnings: string[];
  stage_timings: Record<string, number>;
  configuration: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
}

export interface Speaker {
  id: number;
  label: string;
  display_name: string;
  suggested_name: string | null;
  suggestion_reason: string | null;
  suggestion_segment_ids: number[];
}

export interface Segment {
  id: number;
  position: number;
  speaker_id: number | null;
  start_s: number;
  end_s: number;
  /** Current text, including the user's correction if there is one. */
  text: string;
  /** What was originally transcribed, present only when the text has been corrected. */
  original_text: string | null;
}

/** Result of MeetCite's automatic fact-check; "user" means written or edited by the user. */
export type Verdict = "supported" | "partial" | "unsupported" | "unverified" | "user";

/** Fields every AI-generated item carries: where it came from and whether that checks out. */
export interface Checked {
  source_segment_ids: number[];
  has_source: boolean;
  evidence_status: EvidenceStatus;
  verdict: Verdict;
  verdict_note: string | null;
}

export interface SummaryPoint extends Checked {
  text: string;
}

export interface Position extends Checked {
  speaker: string;
  view: string;
}

export interface Topic extends Checked {
  title: string;
  summary: string;
  outcome: string | null;
  points: SummaryPoint[];
  positions: Position[];
}

export interface Verification {
  method: string;
  supported: number;
  partial: number;
  unsupported: number;
}

/** One configuration's notes, with the metadata needed to reproduce them. */
export interface Summary {
  id: number;
  configuration: Summarizer | "manual";
  prompt_version: string;
  settings: Record<string, unknown>;
  timings: Record<string, number>;
  is_active: boolean;
  text: string;
  overview: string;
  points: SummaryPoint[];
  topics: Topic[];
  open_questions: SummaryPoint[];
  risks: SummaryPoint[];
  verification: Verification;
  continuity: Continuity;
  agenda_review: AgendaReview;
  decisions: Decision[];
  action_items: ActionItem[];
  model_used: string;
  created_at: string;
}

export interface ClaimReview {
  claim_key: string;
  claim_type: string;
  label: ReviewLabel;
  notes: string | null;
  configuration: string;
  created_at: string;
}

export interface Decision extends Checked {
  id: number;
  text: string;
}

export interface ActionItem extends Checked {
  id: number;
  task: string;
  owner: string | null;
  deadline: string | null;
  status: "open" | "done";
}

export interface MeetingDetail extends MeetingListItem {
  original_filename: string;
  has_names_file: boolean;
  agenda: string | null;
  job: Job | null;
  speakers: Speaker[];
  segments: Segment[];
  /** The active configuration's notes; `decisions` and `action_items` belong to it. */
  summary: Summary | null;
  decisions: Decision[];
  action_items: ActionItem[];
  /** Every configuration's notes, for side-by-side comparison. */
  summaries: Summary[];
  /** The current user's factual-support labels. */
  reviews: ClaimReview[];
}

export interface MeetingStatus {
  meeting_id: number;
  status: MeetingStatusValue;
  stage: string;
  progress_pct: number;
  error: string | null;
  warnings: string[];
}

export interface MediaInfo {
  url: string;
  peaks: number[];
  duration_s: number | null;
}

export interface AppConfig {
  summarizers: Summarizer[];
  default_summarizer: Summarizer;
  max_upload_mb: number;
  max_duration_s: number;
  ai_mode: "real" | "fake";
  /** Where the AI runs: on the MeetCite server ("local") or with AssemblyAI + Claude ("cloud"). */
  ai_provider: "local" | "cloud";
  /** New accounts need the sign-up code the administrator hands out. */
  signup_code_required: boolean;
  /** Live captions while recording (cloud mode only). */
  live_available: boolean;
}

export interface AskResponse {
  answer: string;
  source_segment_ids: number[];
}

import type {
  ActionItem,
  AppConfig,
  AskResponse,
  ClaimReview,
  Decision,
  MediaInfo,
  MeetingDetail,
  MeetingListItem,
  MeetingStatus,
  ReviewLabel,
  Segment,
  Series,
  SeriesAction,
  SeriesDetail,
  SeriesSource,
  Speaker,
  Summarizer,
  SummaryPoint,
  TokenResponse,
  User,
} from "./types";

const TOKEN_KEY = "meetmind-token";

/**
 * Where the API lives. Empty (the default) means the same site, which suits the dev proxy and Docker.
 * When the website is hosted separately (e.g. shared hosting) set VITE_API_URL at build time,
 * e.g. VITE_API_URL=https://api.example.com
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Turns an API path such as "/api/meetings" into a full URL. */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (e.g. private mode): the session lasts until the tab closes */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Called when any request comes back 401, so the app can return to the login page. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  }
  return status >= 500 ? "Something went wrong on the server. Please try again." : `Request failed (${status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the MeetMind server. Check that it is running.");
  }
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(body, res.status));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  config: () => request<AppConfig>("/api/config"),

  register: (body: { email: string; name: string; password: string; signup_code?: string }) =>
    request<TokenResponse>("/api/auth/register", { method: "POST", body: json(body) }),
  login: (body: { email: string; password: string }) =>
    request<TokenResponse>("/api/auth/login", { method: "POST", body: json(body) }),
  me: () => request<User>("/api/auth/me"),

  listMeetings: (q?: string) => request<MeetingListItem[]>(`/api/meetings${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getMeeting: (id: number) => request<MeetingDetail>(`/api/meetings/${id}`),
  getStatus: (id: number) => request<MeetingStatus>(`/api/meetings/${id}/status`),
  updateMeeting: (
    id: number,
    body: { title?: string; summary_points?: SummaryPoint[]; series_id?: number | null; agenda?: string | null },
  ) => request<MeetingListItem>(`/api/meetings/${id}`, { method: "PATCH", body: json(body) }),
  /** Re-check the minutes against the agenda and earlier meetings in the series. */
  refreshMemory: (id: number) => request<MeetingListItem>(`/api/meetings/${id}/memory`, { method: "POST" }),

  listSeries: () => request<Series[]>("/api/series"),
  createSeries: (name: string) => request<Series>("/api/series", { method: "POST", body: json({ name }) }),
  renameSeries: (id: number, name: string) =>
    request<Series>(`/api/series/${id}`, { method: "PATCH", body: json({ name }) }),
  deleteSeries: (id: number) => request<void>(`/api/series/${id}`, { method: "DELETE" }),
  getSeries: (id: number) => request<SeriesDetail>(`/api/series/${id}`),
  askSeries: (id: number, question: string) =>
    request<{ answer: string; sources: SeriesSource[] }>(`/api/series/${id}/ask`, {
      method: "POST",
      body: json({ question }),
    }),
  openActions: () => request<SeriesAction[]>("/api/action-items"),

  /** A short-lived token for the live-captions WebSocket (the API key stays on the server). */
  liveToken: () => request<{ token: string; websocket_url: string }>("/api/live/token", { method: "POST" }),
  liveNotes: (turns: { text: string; speaker?: string }[]) =>
    request<{
      decisions: string[];
      actions: { task: string; owner: string | null; deadline: string | null }[];
      questions: string[];
    }>("/api/live/notes", { method: "POST", body: json({ turns }) }),
  deleteMeeting: (id: number) => request<void>(`/api/meetings/${id}`, { method: "DELETE" }),
  regenerate: (id: number, model: Summarizer) =>
    request<MeetingStatus>(`/api/meetings/${id}/regenerate`, { method: "POST", body: json({ model }) }),
  retry: (id: number) => request<MeetingStatus>(`/api/meetings/${id}/retry`, { method: "POST" }),
  media: (id: number) => request<MediaInfo>(`/api/meetings/${id}/media`),
  ask: (id: number, question: string) =>
    request<AskResponse>(`/api/meetings/${id}/ask`, { method: "POST", body: json({ question }) }),

  renameSpeaker: (id: number, display_name: string) =>
    request<Speaker>(`/api/speakers/${id}`, { method: "PATCH", body: json({ display_name }) }),
  activateSummary: (meetingId: number, summaryId: number) =>
    request<MeetingListItem>(`/api/meetings/${meetingId}/summaries/${summaryId}/activate`, { method: "POST" }),
  /** Record a human factual-support label. `id` is a number, or "summaryId:path" for items inside a summary. */
  reviewClaim: (type: string, id: string | number, label: ReviewLabel, notes?: string) =>
    request<ClaimReview>(`/api/claims/${type}/${encodeURIComponent(String(id))}/review`, {
      method: "POST",
      body: json({ label, notes: notes ?? null }),
    }),
  editSegment: (id: number, body: { text?: string; speaker_id?: number; revert?: boolean }) =>
    request<Segment>(`/api/segments/${id}`, { method: "PATCH", body: json(body) }),
  editDecision: (id: number, text: string) =>
    request<Decision>(`/api/decisions/${id}`, { method: "PATCH", body: json({ text }) }),
  deleteDecision: (id: number) => request<void>(`/api/decisions/${id}`, { method: "DELETE" }),
  addActionItem: (meetingId: number, body: { task: string; owner?: string | null; deadline?: string | null }) =>
    request<ActionItem>(`/api/meetings/${meetingId}/action-items`, { method: "POST", body: json(body) }),
  editActionItem: (id: number, body: Partial<Pick<ActionItem, "task" | "owner" | "deadline" | "status">>) =>
    request<ActionItem>(`/api/action-items/${id}`, { method: "PATCH", body: json(body) }),
  deleteActionItem: (id: number) => request<void>(`/api/action-items/${id}`, { method: "DELETE" }),
};

/**
 * Upload with progress reporting. fetch() cannot report upload progress, so this uses XMLHttpRequest.
 */
export function uploadMeeting(
  form: {
    file: File;
    title: string;
    model: Summarizer;
    source?: "upload" | "browser";
    namesFile?: File | null;
    seriesId?: number | null;
    agenda?: string;
  },
  onProgress: (fraction: number) => void,
): Promise<MeetingListItem> {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append("file", form.file);
    data.append("title", form.title);
    data.append("model", form.model);
    data.append("source", form.source ?? "upload");
    if (form.namesFile) data.append("names_file", form.namesFile);
    if (form.seriesId) data.append("series_id", String(form.seriesId));
    if (form.agenda?.trim()) data.append("agenda", form.agenda.trim());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/api/meetings"));
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status === 401) onUnauthorized();
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as MeetingListItem);
      else reject(new ApiError(xhr.status, errorMessage(body, xhr.status)));
    };
    xhr.onerror = () => reject(new ApiError(0, "The upload failed. Check your connection and try again."));
    xhr.send(data);
  });
}

/** Downloads an export with the auth header, then saves it via a temporary link. */
export async function downloadExport(id: number, format: "pdf" | "docx" | "txt"): Promise<void> {
  const token = tokenStore.get();
  const res = await fetch(apiUrl(`/api/meetings/${id}/export?format=${format}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(body, res.status));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `minutes.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The token is sent as the socket's first message, never in the URL, so it stays out of server logs. */
export function openProgressSocket(id: number): WebSocket {
  const base = new URL(API_BASE || window.location.origin);
  const proto = base.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${base.host}/api/meetings/${id}/progress`);
  ws.addEventListener("open", () => ws.send(tokenStore.get() ?? ""));
  return ws;
}

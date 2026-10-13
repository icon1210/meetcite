# MeetCite

**AI-powered meeting transcription and summarization.** Upload a meeting recording and get a
speaker-labelled transcript, a concise summary, key decisions, and action items with owners and
deadlines. Every AI-generated point links back to the transcript lines it came from, so it can be checked.

All AI runs locally by default (Whisper, pyannote, BART, Llama 3.1 via Ollama): recordings never leave the machine.

MSc Information Technology project, University of the West of Scotland.

---

## Core principle: evidence-grounded meeting records

Every important AI-generated outcome should be **traceable, reviewable and honest about uncertainty**
(full specification, §1). MeetCite therefore:

| Feature | What it does |
|---|---|
| **Evidence links** | Every decision, action item and summary point stores the transcript segment IDs behind it and links to that second of the recording |
| **Evidence status** | Each claim is marked *valid*, *missing* (nothing cited) or *invalid* (cited lines that don't exist), and missing or invalid evidence is flagged (US8) |
| **Uncertainty-aware extraction** | Owners and deadlines are left as "not stated" unless the transcript supports them, and missing ones are flagged |
| **Human review** | Each claim can be labelled with the 5-point rubric (supported, partially supported, unsupported, contradicted, unclear). These labels are the evidence for RQ2 |
| **AI check (aid only)** | An automatic second pass rates each claim against its cited lines. It is labelled "AI check" because a valid citation or an AI rating does not prove a claim (spec §13) |
| **C1 vs C2 comparison** | The same local LLM with a plain prompt (C1 baseline) and with citations, schema and evidence checks (C2) are stored side by side for the same meeting (Compare tab) |
| **Real speaker names** | Attach the Teams/Zoom transcript (.vtt) to get participants' real names, or accept names MeetCite finds in introductions ("I'm Priya") |
| **Browser recording** | Record a Teams/Zoom/Meet call from Chrome or Edge, with a mandatory consent confirmation and a visible recording indicator (spec §14) |
| **Reproducibility** | Each summary stores its model, configuration, prompt version and timings; experiments are saved to `evaluation_runs` |

Beyond the specification (to keep out of the C1/C2 comparison unless the supervisor agrees): topic-by-topic
minutes with each person's position, open questions and risks, participation insights, and Q&A.
## What's in this repository

| Folder | Contents |
|---|---|
| `backend/` | FastAPI API, database models, Celery worker and the AI pipeline (`app/pipeline/`) |
| `frontend/` | React + TypeScript web app (Vite, Tailwind, TanStack Query, WaveSurfer.js) |
| `research/` | Experiment scripts E1–E5, BART fine-tuning on AMI, user-study scoring |
| `docker-compose.yml` | Starts the whole system with one command |
| `.github/workflows/ci.yml` | Lint, type checks and tests on every push |

## How it works

```
Browser (React) ──► Nginx ──► FastAPI ──► Redis queue ──► Celery GPU worker
                                │                           1. FFmpeg → 16 kHz WAV
                                ▼                           2. faster-whisper (word timestamps)
                           PostgreSQL ◄──────────────────── 3. pyannote (who spoke when)
                                                            4. align words to speakers
                                                            5. clean + chunk
                                                            6. BART or local LLM (map-reduce, JSON)
                                                            7. validate sources, store
```

* Each stage saves its output, so a failed job **resumes from the last completed stage** (Retry button).
* Progress is streamed live over a WebSocket (with polling fallback).
* The LLM must return strict JSON citing segment IDs; it is validated with Pydantic and retried if invalid.
  Cited IDs that don't exist are removed, and points left with no valid source are **flagged in the UI**.
* Models are loaded one at a time and released after use, so everything fits on a 6 GB GPU (e.g. RTX 2060).

---

## Option A — Run with Docker (recommended; one command)

**You need:** Windows 11 with WSL 2, an NVIDIA GPU with a recent driver, and
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (GPU support is built in on Windows with WSL 2).

1. Copy `.env.example` to `.env` and fill in `SECRET_KEY`, `POSTGRES_PASSWORD` and `HF_TOKEN`
   (instructions are in the file).
2. In this folder run:
   ```bash
   docker compose up -d --build
   ```
   The first start downloads several GB (PyTorch, the Llama model, then Whisper/pyannote on first use).
3. Open **http://localhost:8080**, create an account and upload a recording.

Public demo link (HTTPS, no port forwarding): `docker compose --profile public up -d`, then
`docker compose logs cloudflared` shows a `https://….trycloudflare.com` address.

## Option B — Run directly on Windows (development)

1. Install tools (PowerShell):
   ```bash
   winget install Python.Python.3.11 Gyan.FFmpeg Ollama.Ollama Git.Git
   ```
   (Python 3.11 is used because every ML library supports it; reopen the terminal afterwards.)
   then `ollama pull llama3.1:8b`.
2. Backend:
   ```bash
   cd backend
   py -3.11 -m venv .venv
   .venv\Scripts\pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121
   .venv\Scripts\pip install -r requirements-ml.txt -r requirements-dev.txt
   ```
   Create `backend/.env` containing at least `SECRET_KEY=...` and `HF_TOKEN=...`, then:
   ```bash
   .venv\Scripts\python -m uvicorn app.main:app --port 8000
   ```
   Without Redis, jobs run in a background thread inside the API (`TASK_MODE=thread`, the default).
   SQLite is used unless `DATABASE_URL` points at PostgreSQL.
3. Frontend (second terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open **http://localhost:5173**. Visitors see the landing page; logged-in users see their meetings.

**Putting it online:** see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (website on shared hosting, AI on a GPU
machine). What is and isn't built yet: [docs/AUDIT.md](docs/AUDIT.md).

**Day-to-day start:** once installed, `.\start-meetcite.ps1` (project root) starts Ollama, the API and the website.

**Keep data out of cloud-synced folders.** If the project sits in OneDrive/Dropbox, set `DATA_DIR` and
`DATABASE_URL` in `backend/.env` to a local folder (e.g. `DATA_DIR=C:/MeetMindData`,
`DATABASE_URL=sqlite:///C:/MeetMindData/meetmind.db`) so recordings are never synced (NFR6).

**Trying the interface without a GPU:** set `AI_MODE=fake` — every stage returns a fixed sample meeting.
This is for demos and automated tests only.

API documentation (interactive): http://localhost:8000/docs

---

## Tests and quality checks

| Check | Command | Status |
|---|---|---|
| Backend unit + integration tests (pytest) | `cd backend && .venv\Scripts\python -m pytest` | 55 passing |
| Backend lint / types | `ruff check app tests` · `mypy app` | clean |
| Frontend unit tests (Vitest + RTL) | `cd frontend && npm test` | 10 passing |
| Frontend lint / types / build | `npm run lint` · `npm run typecheck` · `npm run build` | clean |
| End-to-end (Playwright) | `npm run e2e` (stop the MeetCite API first) | 4 passing |

The tests cover alignment and chunking logic, JSON validation and retries, map-reduce summarization,
source checking, rule-based extraction, authentication, **access control between users**, upload
validation, editing, search, exports (PDF/DOCX/TXT), regeneration, Q&A, scoped audio tokens,
cascading deletion of files, and the WebSocket progress stream. The end-to-end test runs the whole
journey: register → upload → wait for results → follow a source link → accept a suggested speaker name →
rename a speaker → label a claim → generate C1 and compare it with C2 → complete an action item → export → delete,
plus a check that browser recording cannot start without the consent confirmation, and a landing-page check.

---

## Requirements traceability

| Requirement | Where it is implemented |
|---|---|
| FR1 register / log in / log out | `backend/app/routers/auth.py`, `frontend/src/pages/AuthPages.tsx` |
| FR2 drag-and-drop upload | `frontend/src/pages/UploadPage.tsx`, `backend/app/storage.py` |
| FR3 background processing + live progress | `backend/app/jobs.py`, `pipeline/runner.py`, WebSocket in `routers/meetings.py`, `frontend/src/lib/useProgress.ts` |
| FR4 word-level timestamps | `backend/app/pipeline/transcribe.py` (stored in `segments.words`) |
| FR5 speaker labels | `pipeline/diarize.py`, `pipeline/align.py` |
| FR6–FR8 summary, action items, decisions | `pipeline/summarize_llm.py`, `pipeline/summarize_bart.py`, `pipeline/extract_rules.py` |
| FR9 source links | `pipeline/summary_schema.py` (`check_sources`), `frontend/src/components/SourceLinks.tsx` |
| FR10 audio player, jump to segment | `frontend/src/components/AudioPlayer.tsx`, `backend/app/peaks.py` |
| FR11 rename speakers, edit everything | `backend/app/routers/edits.py`, `frontend/src/components/meeting/*` |
| FR12 export PDF/DOCX/TXT | `backend/app/export.py` |
| FR13 choose / switch model | upload form + `POST /api/meetings/{id}/regenerate` |
| FR14 dashboard, search, delete | `frontend/src/pages/DashboardPage.tsx` (PostgreSQL full-text search) |
| FR15 search in transcript | `frontend/src/components/meeting/TranscriptTab.tsx` |
| FR16 ask questions | `backend/app/pipeline/ask.py`, `frontend/src/components/meeting/AskTab.tsx` |
| NFR5 security | Argon2, JWT, per-user query filtering (`deps.py`), scoped media tokens, token never in URLs/logs for WebSockets |
| NFR6 privacy | local models by default; cloud LLM disabled unless explicitly enabled |
| NFR7 reliability | stage outputs on disk, resume on retry, interrupted jobs marked failed on restart |
| NFR9 portability | `docker-compose.yml` |
| NFR10 accessibility | labels, keyboard focus rings, skip link, ARIA progress/live regions, AA colour contrast, reduced motion |

## Configuration

All settings are environment variables (see `.env.example` and `backend/app/config.py`). Notable ones:

| Variable | Default | Meaning |
|---|---|---|
| `WHISPER_MODEL` | `large-v3` | `small` / `medium` for faster, less accurate transcription |
| `WHISPER_COMPUTE_TYPE` | `int8_float16` | quantisation; keeps Whisper large-v3 at ~3 GB VRAM |
| `HF_TOKEN` | – | needed for pyannote; without it everything is attributed to one speaker (with a warning) |
| `OLLAMA_MODEL` | `llama3.1:8b` | any Ollama model with good JSON output |
| `BART_MODEL` | `facebook/bart-large-cnn` | set to the AMI fine-tuned checkpoint after running `research/finetune_bart_ami.py` |
| `CLOUD_LLM_ENABLED` | `false` | enables the optional Claude comparison (public data only) |

## Research experiments

See [research/README.md](research/README.md).

## Data and model licences

AMI Meeting Corpus: CC BY 4.0 (Carletta et al., 2005). Models are used under their own licences
(Whisper: MIT; pyannote: MIT, gated; BART: MIT; Llama 3.1: Llama 3.1 Community Licence).

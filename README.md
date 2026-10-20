# MeetCite

**Evidence-grounded AI meeting minutes. Every point cites where it was said, and every point is checked.**

MeetCite turns a meeting recording into a speaker-labelled transcript, structured minutes and follow-up tools.
Every item in the minutes links to the transcript lines it came from, and an independent second pass checks each
item against those lines, so readers can see what to trust and what to verify.

| | |
|---|---|
| **Live site** | https://meetcite.com.ng |
| **Programme** | MSc Information Technology, University of the West of Scotland, Group 8 (2026-27) |
| **Status** | Working prototype, deployed online. Research evaluation and user study pending ethical approval. |
| **Formerly** | "MeetMind" (renamed October 2026) |

---

## Contents

1. [The problem](#the-problem)
2. [The team](#the-team)
3. [Features](#features)
4. [How it works](#how-it-works)
5. [Technology](#technology)
6. [Repository layout](#repository-layout)
7. [Running it locally](#running-it-locally)
8. [Deployment](#deployment)
9. [Backups and restore](#backups-and-restore)
10. [Configuration](#configuration)
11. [Tests and quality checks](#tests-and-quality-checks)
12. [API](#api)
13. [Database](#database)
14. [Security](#security)
15. [Privacy, ethics and data protection](#privacy-ethics-and-data-protection)
16. [Research and evaluation](#research-and-evaluation)
17. [Troubleshooting](#troubleshooting)
18. [Limitations and next steps](#limitations-and-next-steps)
19. [Licences and credits](#licences-and-credits)
20. [Use of generative AI](#use-of-generative-ai)

---

## The problem

- **Minutes are slow to write** (often an hour or more per meeting) and often skipped, so decisions are forgotten and
  tasks dropped.
- **AI summaries can state things that were never said** ("hallucination"): a decision nobody made, a deadline
  nobody gave, a task given to the wrong person. A fluent summary gives no sign of which sentences are reliable.
- **Recurring meetings lose continuity:** actions aren't followed up, and decisions change without anyone noticing.
- **Universities** need accurate records, must protect personal data, and need transcripts and captions for
  accessibility.

**Research question.** Does asking the AI to cite the transcript lines behind every point (**C2, evidence-grounded**)
reduce unsupported statements compared with an ordinary AI summary (**C1, plain**)? Both use the same model,
transcript and output fields; only the citation instruction differs.

## The team

| Member | Role | Technical ownership |
|---|---|---|
| Oguanya Kenneth Ifeanyi | Group Lead and Database Lead | Database, accounts and login, migrations, backups, data protection |
| Olayinka Williams Ajibola | Project Design Lead (System and UI/UX) | Architecture, AI summaries and check, series memory, live captions, web app |
| Iloanugo Onyeka Pascal | AI Evaluation Lead | Transcription, speakers, names; C1 vs C2 evaluation |
| Emmanuel Chieji | Testing, Security and Deployment Lead | Media processing, tests, security, monitoring, deployment |
| Chinonye Linda Nwanya | Exports and Usability Lead | Exports, follow-up email, calendar reminders, ethics application, user study |

## Features

**Capture**
- Upload MP3, WAV, M4A, MP4 or WebM recordings, up to 2 hours and 1 GB.
- Record a Teams, Zoom or Google Meet call in Chrome or Edge (shared tab/screen audio and/or microphone).
  Recording cannot start until the user confirms everyone has agreed; an indicator stays visible.
- Live captions and "quick notes" while recording (cloud mode). The browser gets a 60-second token; the API key
  never leaves the server.
- Optional Teams/Zoom transcript (`.vtt`) for real speaker names; optional series and agenda.

**Processing**
- Converts any input to 16 kHz mono; speech to text with word timestamps; speaker separation; alignment.
- Suggests speaker names from introductions ("I'm Priya"), only applied when the user accepts.
- Minutes in which every item cites transcript lines (C2), then the **AI check** on every item.
- Live progress; jobs continue if the user leaves; retries resume completed steps; chime when ready.

**Meeting page tabs:** Summary (overview, key points, topic minutes with each person's position and outcome) ·
Action items · Decisions · Questions & risks · **Evidence review** (record a human label per claim: supported,
partial, unsupported, contradicted, unclear) · Follow-up (agenda check, follow-up email, `.ics` calendar reminders)
· Series memory · Transcript (search, edit, rename speakers) · Compare (C1 vs C2) · Insights (participation,
unassigned actions, reliability) · Ask (answers from the transcript, with sources). Clicking any citation plays the
recording from that moment. Export to **PDF, DOCX and TXT**, with an AI notice and flags on unsupported points.

**Across meetings:** series page (action tracker, decision history, changes, ask across meetings) and a dashboard
(statistics, series, actions due soon, searchable library).

**Accounts and interface:** register/log in, optional sign-up code, permanent deletion, landing page, Mindy the
mascot (status and plain-language errors), light and dark themes.

## How it works

| Stage | Progress | What happens | Local mode | Cloud mode |
|---|---|---|---|---|
| 1. Preprocessing | 0–5% | Convert to 16 kHz mono WAV, check length | FFmpeg (+ volume normalisation) | FFmpeg |
| 2. Transcribing | 5–55% | Speech to timed words | faster-whisper | AssemblyAI |
| 3. Diarizing | 55–75% | Who spoke when | pyannote.audio | AssemblyAI |
| 4. Aligning | 75–78% | Words to speakers; new line after a 2 s pause or at 30 s | MeetCite | MeetCite |
| 5. Summarizing | 78–93% | Cited minutes, map-reduce over chunks, JSON validated and retried | Ollama (Llama 3.1) | Claude |
| 6. Verifying | 93–100% | Each item checked against its cited lines | Ollama, or word-overlap fallback | Claude |

- **Writing the minutes:** filler words are removed from the text the AI sees (the stored transcript keeps them);
  the transcript is chunked at line boundaries with 2 lines of overlap and numbered (`[42] Kenneth: …`); each chunk
  becomes partial notes as JSON citing line numbers (map), then the notes are merged (reduce). Replies must match a
  strict schema (Pydantic) and are retried with the error if invalid; valid replies are cached so retries resume.
  Citations are marked valid, missing or invalid.
- **The AI check:** each claim is shown with only its cited lines (plus one neighbouring line either side) and
  labelled supported / partial / unsupported with a reason. Without a model, a word-overlap check is used (≥60%
  supported, ≥30% partial) and the interface says so.
- **Speed:** an 88-minute meeting took about **3 minutes** end to end in cloud mode.

## Technology

| Area | Tools |
|---|---|
| Web app | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, WaveSurfer.js |
| API | Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, Uvicorn |
| Jobs | Background thread (default) or Celery + Redis |
| Database | SQLite (default, live server) or PostgreSQL |
| Audio | FFmpeg / ffprobe |
| Local AI | faster-whisper (large-v3-turbo), pyannote.audio 3.1, Ollama (Llama 3.1 8B), optional BART |
| Cloud AI | AssemblyAI (speech, speakers, live captions), Anthropic Claude (`claude-opus-5-5`) |
| Security | Argon2, JWT, rate limiting |
| Exports | python-docx, WeasyPrint, fpdf2 |
| Hosting | Docker Compose, nginx, Caddy (automatic HTTPS) |
| Testing | pytest, ruff, mypy, Vitest + React Testing Library, Playwright, GitHub Actions |

## Repository layout

| Path | Contents |
|---|---|
| `backend/app/pipeline/` | The AI pipeline: `preprocess.py` (Emmanuel); `transcribe.py`, `cloud_transcribe.py`, `diarize.py`, `align.py`, `names.py` (Pascal); `chunking.py`, `summarize_llm.py`, `verify.py`, `continuity.py`, `runner.py` (Olayinka); `ask.py`, `extract_rules.py`, `llm_clients.py`, `fake.py` |
| `backend/app/routers/` | API endpoints: auth, meetings, edits, claims, series, live |
| `backend/app/` | `main.py`, `config.py`, `models.py`, `schemas.py`, `security.py`, `ratelimit.py`, `deps.py`, `export.py` (Chinonye), `jobs.py` |
| `backend/alembic/` | Database migrations 0001–0004 (Kenneth) |
| `backend/tests/` | 84 backend tests |
| `frontend/src/` | Pages, meeting tabs, Mindy (`components/Buddy.tsx`), live captions, recorder, `lib/deadlines.ts` (Chinonye) |
| `frontend/e2e/` | End-to-end browser tests (also produce screenshots) |
| `research/` | Evaluation scripts E1–E5, AMI download, SUS scoring, user-study materials |
| `deploy/` | Server package script, Caddy config, nightly backup script, shared-hosting files |
| `docs/` | `DEPLOYMENT.md`, `AUDIT.md`, `MeetCite_README.txt` |
| `docker-compose.yml` | Full local set-up with a GPU (PostgreSQL, Redis, Ollama) |
| `docker-compose.cloud.yml` | Cloud-mode server set-up (used on meetcite.com.ng) |
| `.env.example`, `.env.cloud.example` | Settings templates (no real keys) |
| `start-meetcite.ps1` | Starts everything on Windows |

## Running it locally

**Try the interface without AI or a GPU:** set `AI_MODE=fake` in `backend/.env`; every upload returns a fixed
sample meeting (used for demos and tests).

**Windows development set-up**

1. Install tools, then reopen the terminal (and `ollama pull llama3.1:8b` for local AI):
   ```bash
   winget install Python.Python.3.11 Gyan.FFmpeg Ollama.Ollama Git.Git
   ```
2. Backend:
   ```bash
   cd backend
   py -3.11 -m venv .venv
   .venv\Scripts\pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121
   .venv\Scripts\pip install -r requirements-ml.txt -r requirements-dev.txt
   ```
   Create `backend/.env` with at least `SECRET_KEY=…` (plus `HF_TOKEN=…` for local speaker separation, or the cloud
   settings below), then:
   ```bash
   .venv\Scripts\python -m uvicorn app.main:app --port 8000
   ```
3. Web app (second terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173. Interactive API docs: http://localhost:8000/docs.
4. Day to day: `.\start-meetcite.ps1` (if scripts are blocked: `powershell -ExecutionPolicy Bypass -File .\start-meetcite.ps1`).

**Cloud AI locally (fast, no GPU):** in `backend/.env` set `AI_PROVIDER=cloud`, `ASSEMBLYAI_API_KEY` and
`ANTHROPIC_API_KEY`.

**Full local Docker set-up with a GPU:** copy `.env.example` to `.env` (`SECRET_KEY`, `POSTGRES_PASSWORD`,
`HF_TOKEN`), run `docker compose up -d --build`, open http://localhost:8080.

**Keep recordings out of OneDrive/Dropbox:** point `DATA_DIR` and `DATABASE_URL` at a local folder
(e.g. `C:/MeetMindData`).

## Deployment

The live site runs on a small Ubuntu VPS (2 GB RAM is enough in cloud mode) with
[`docker-compose.cloud.yml`](docker-compose.cloud.yml): the API, the web app (nginx) and Caddy, which obtains and
renews HTTPS certificates automatically. The domain's `@` and `www` A records point to the server; only ports 22,
80 and 443 are open; all services restart automatically.

```bash
git clone https://github.com/icon1210/meetcite.git /opt/meetcite && cd /opt/meetcite
cp .env.cloud.example .env    # fill in DOMAIN, SECRET_KEY, REGISTRATION_CODE and the two API keys
docker compose -f docker-compose.cloud.yml up -d --build
```

| Task | Command (in `/opt/meetcite`) |
|---|---|
| Status | `docker compose -f docker-compose.cloud.yml ps` |
| Logs | `docker compose -f docker-compose.cloud.yml logs -f api` |
| Update | `git pull && docker compose -f docker-compose.cloud.yml up -d --build` |

Shared web hosting (cPanel/DirectAdmin) cannot run MeetCite's server, but can hold the domain and DNS. Full guide,
including other options: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Backups and restore

[`deploy/cloud/meetcite-backup.sh`](deploy/cloud/meetcite-backup.sh) runs nightly at 02:30 UTC (cron). It snapshots
the database with SQLite's online backup (safe while MeetCite runs), archives it with the uploaded recordings, checks
the archive, and keeps 7 daily and 4 weekly copies in `/var/backups/meetcite`, skipping rather than filling the disk.
Log: `/var/log/meetcite-backup.log`. A test restore passed (integrity "ok", all tables present).

Restore and installation steps: [docs/DEPLOYMENT.md, section 7](docs/DEPLOYMENT.md#7-nightly-backups). Copy a backup
off the server regularly; on-server copies don't survive losing the server.

## Configuration

All settings are environment variables (`backend/.env` locally, `.env` on the server); defaults in
[`backend/app/config.py`](backend/app/config.py).

| Variable | Default | Meaning |
|---|---|---|
| `SECRET_KEY` | must be set | Signs login tokens |
| `REGISTRATION_CODE` | empty (open sign-up) | Code needed to create an account |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Login lifetime |
| `AUTH_ATTEMPTS_PER_MINUTE` | `10` | Sign-in/sign-up attempts per minute |
| `TRUSTED_PROXY_HEADER` | – | Real visitor IP behind a proxy |
| `CORS_ORIGINS` | `http://localhost:5173` | Sites allowed to call the API |
| `DATABASE_URL` | `sqlite:///./data/meetcite.db` | Database location |
| `DATA_DIR` | `./data` | Recordings and working files |
| `MAX_UPLOAD_MB` / `MAX_DURATION_S` | `1024` / `7200` | Upload size and length limits |
| `TASK_MODE` | `thread` | `thread` or `celery` (with `REDIS_URL`) |
| `AI_MODE` | `real` | `real` or `fake` (demo/tests) |
| `AI_PROVIDER` | `local` | `local` (GPU) or `cloud` (AssemblyAI + Claude) |
| `DEVICE` | `cuda` | `cuda` or `cpu` for local mode |
| `WHISPER_MODEL` | `large-v3-turbo` | Local speech model |
| `WHISPER_COMPUTE_TYPE` / `WHISPER_BATCH_SIZE` / `WHISPER_BEAM_SIZE` | `int8_float16` / `16` / `1` | Local speech speed/accuracy |
| `HF_TOKEN` | – | Needed for local speaker separation (pyannote) |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `llama3.1:8b` | Local language model |
| `DEFAULT_SUMMARIZER` | `llm` | `llm` (C2), `bart` or `cloud` |
| `LLM_CONTEXT_TOKENS` / `LLM_MAX_OUTPUT_TOKENS` / `LLM_MAX_RETRIES` | `8192` / `4096` / `3` | Local model limits |
| `VERIFY_WITH_LLM` | `true` | Use the model for the AI check |
| `ASSEMBLYAI_API_KEY` / `ASSEMBLYAI_BASE_URL` | – / `https://api.assemblyai.com` | Cloud speech (EU: `https://api.eu.assemblyai.com`) |
| `ANTHROPIC_API_KEY` / `CLOUD_LLM_MODEL` / `CLOUD_LLM_EFFORT` | – / `claude-opus-5-5` / `low` | Claude settings |

Never commit real keys; `.env` files are excluded from Git.

## Tests and quality checks

| Check | Command | Result (Oct 2026) |
|---|---|---|
| Backend tests | `cd backend && .venv\Scripts\python -m pytest` | 84 passing |
| Backend lint / format / types | `ruff check app tests` · `ruff format --check app tests` · `mypy app` | clean |
| Web app unit tests | `cd frontend && npm test` | 29 passing |
| Web app lint / types / build | `npm run lint` · `npm run typecheck` · `npm run build` | clean |
| End-to-end (Playwright) | `npm run e2e` (stop the local MeetCite API first) | 6 passing, including a screen-size check of every page at 11 widths (320–1920px) |

Coverage includes alignment and chunking, JSON validation and retries, map-reduce summarisation, citation checks,
the AI check and its fallback, series memory and agenda checks, live-caption tokens, cloud transcription parsing,
authentication, sign-up code, rate limiting, access control between users, uploads, editing, exports, Q&A, audio
tokens, deletion, deadline parsing and calendar files, and the full journey in a real browser. GitHub Actions runs
these checks on every push.

## API

Interactive docs at `/docs` on the API. All endpoints except health, config, register and login require a login token.

| Area | Endpoints |
|---|---|
| System | `GET /api/health`, `GET /api/config` |
| Accounts | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Meetings | `GET/POST /api/meetings`; `GET/PATCH/DELETE /api/meetings/{id}`; `GET …/status`; `WS …/progress`; `POST …/retry`; `POST …/regenerate`; `POST …/summaries/{sid}/activate`; `POST …/memory`; `GET …/export?format=pdf\|docx\|txt`; `GET …/media`; `GET …/audio`; `POST …/action-items`; `POST …/ask` |
| Edits | `GET /api/action-items`; `PATCH /api/speakers/{id}`; `PATCH /api/segments/{id}`; `PATCH/DELETE /api/decisions/{id}`; `PATCH/DELETE /api/action-items/{id}` |
| Reviews | `POST /api/claims/{type}/{id}/review` |
| Series | `GET/POST /api/series`; `GET/PATCH/DELETE /api/series/{id}`; `POST /api/series/{id}/ask` |
| Live | `POST /api/live/token`, `POST /api/live/notes` |

## Database

SQLAlchemy models with Alembic migrations applied on start-up (current version 0004).

| Table | Holds |
|---|---|
| `users` | Name, email, hashed password |
| `series` | Recurring meeting groups |
| `meetings` | Title, file, status, source, agenda, series |
| `jobs` | Progress, stage timings, warnings, errors |
| `speakers` | Labels, real names, suggestions |
| `segments` | Transcript lines (time, speaker, text, original text if corrected) |
| `summaries` | One per configuration: minutes, check results, series memory, agenda review, model, prompt version, timings |
| `decisions`, `action_items` | With citations and check results; actions have owner, deadline, status |
| `claim_reviews` | Human labels for the evaluation |
| `evaluation_runs` | Evaluation records |

Deleting a user or meeting cascades to all related data and files; deleting a series keeps its meetings.

## Security

- Argon2 password hashing; signed JWT login tokens (60 minutes); separate 6-hour audio tokens per meeting.
- Same message for unknown email and wrong password; rate limiting (HTTP 429); optional sign-up code (constant-time
  comparison); ownership checks on every request.
- API keys only in `.env` on the server; live captions use 60-second server-issued tokens; WebSocket progress sends
  the token as a message, never in the URL.
- HTTPS with HSTS in production; firewall limited to ports 22, 80 and 443.

## Privacy, ethics and data protection

| Data | Where it goes | Kept until |
|---|---|---|
| Account | MeetCite database | Account deleted |
| Recording | Server disk; **cloud mode:** compressed audio to AssemblyAI; **local mode:** never leaves the server | Meeting deleted |
| Transcript and minutes | MeetCite database; **cloud mode:** text to Anthropic (Claude) | Meeting deleted |
| Live caption audio | Browser to AssemblyAI | Not stored |
| Human claim labels | MeetCite database | With the meeting |

- Consent before recording; processing location disclosed on the landing page; AI content labelled.
- UK GDPR: data minimisation, storage limitation, right to erasure.
- **No participant testing or new research recordings before university ethical approval.** Use the public AMI
  Meeting Corpus for the accuracy evaluation wherever possible.
- **To do before the user study:** update [the consent form](research/user_study/consent_form.md), which says
  recordings are processed "on the researcher's computer only", to describe cloud processing if the live site is used.

## Research and evaluation

Scripts in [`research/`](research/README.md) use the same pipeline code as the app:

| Script | Measures |
|---|---|
| `ami.py` | Downloads the AMI Meeting Corpus |
| `e1_transcription.py` | Word error rate and speed |
| `e2_diarization.py` | Diarization error rate (0.25 s collar) |
| `e3_summarization.py` | ROUGE and BERTScore |
| `e4_hallucination_sheet.py` | Blind claim labelling sheet and scoring |
| `e5_speed.py` | Seconds per stage by meeting length |
| `claim_review_report.py` | Human claim labels from the app |
| `sus_score.py` | System Usability Scale |
| `finetune_bart_ami.py` | Optional BART fine-tuning |

Targets: C2 has fewer unsupported claims than C1; the AI check agrees with human labels (Cohen's kappa ≥ 0.6);
SUS ≥ 75; under 5 minutes per hour of audio in cloud mode.

## Troubleshooting

| Problem | Fix |
|---|---|
| Local site won't open | Run `start-meetcite.ps1`; keep the "MeetCite API" and "MeetCite Web" windows open |
| "Running scripts is disabled" | `powershell -ExecutionPolicy Bypass -File <script>` |
| Local processing slow | Use performance mode on the laptop, or cloud mode |
| "No call audio was shared" | Share the meeting tab or entire screen with "Share tab/system audio" ticked |
| Everyone is one speaker (local) | Set `HF_TOKEN` and accept pyannote's terms on huggingface.co |
| "AssemblyAI rejected the API key" | Check the key in `.env` (no spaces or quotes) |
| Live captions unavailable | Cloud mode with an AssemblyAI key only |
| End-to-end tests fail at start | Stop the local API on port 8000 first |
| Live site down | `docker compose -f docker-compose.cloud.yml ps` and `… logs api`, then update |
| No HTTPS certificate | Check the `@` and `www` A records point to the server |

## Limitations and next steps

**Limitations:** English only; up to 2 hours per recording; the AI check can itself be wrong; overlapping speech
reduces speaker accuracy; cloud mode uses third-party processors; single server; no shared team workspaces;
recording needs desktop Chrome or Edge.

**Next:** MOV/MKV uploads · account deletion in the app · WCAG 2.2 AA audit, monitoring and load test · off-server
backup copies · supervisor-meeting export in the UWS template · user study and C1 vs C2 evaluation after ethical
approval · consent form update.

## Licences and credits

AMI Meeting Corpus: CC BY 4.0 (Carletta et al., 2005). Whisper: MIT. pyannote.audio: MIT (gated model). BART: MIT.
Llama 3.1: Llama 3.1 Community Licence. AssemblyAI and Anthropic Claude: used under their API terms. Hero photo:
Julia Lopez on Unsplash. Icons: lucide (ISC).

## Use of generative AI

MeetCite uses AI services as system components (AssemblyAI for speech; Anthropic Claude or a local Llama model for
the minutes and the AI check). Generative AI (Anthropic's Claude, via Claude Code) was also used as a coding assistant
in building the software, under the group's direction; this is stated in the University's declaration of originality
and use of generative AI.

A plain-text copy of this README is in [docs/MeetCite_README.txt](docs/MeetCite_README.txt).

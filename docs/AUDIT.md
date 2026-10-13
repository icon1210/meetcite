# MeetMind requirement audit

Audit of the code against the **Master Development Prompt** and the **Premium Landing Page
Design Requirements**. Last updated 8 October 2026.

Key: ✅ implemented and tested · 🟡 partly done · ❌ not done yet

Verified test results on 8 October 2026: backend **55 passed** (pytest), frontend **10 passed**
(Vitest), end-to-end **4 passed** (Playwright), lint and type checks clean. The real AI pipeline has
processed an 87.8-minute Teams recording end to end on an RTX 2060.

## 1. Purpose

| Requirement | Status | Notes |
|---|---|---|
| Speech-to-text transcription | ✅ | faster-whisper large-v3 |
| Speaker identification | 🟡 | pyannote works only with a Hugging Face token (not set yet); Teams/Zoom `.vtt` names ✅ |
| Summary, key points, decisions, actions, owners, deadlines | ✅ | overview, key points, topics, decisions, actions, open questions, risks |
| Searchable transcripts | ✅ | dashboard search covers titles and transcripts |
| Timestamp-linked evidence, clickable | ✅ | citations jump to and highlight transcript lines and play the audio |
| Warnings when claims can't be verified | ✅ | evidence status + AI check + trust banner |

## 2. Technology stack

| Requirement | Status | Notes |
|---|---|---|
| React, TypeScript, Vite, semantic HTML, CSS | ✅ | Tailwind + `landing.css` |
| FastAPI, Pydantic, SQLAlchemy, Alembic | ✅ | 3 migrations, auto-run on start |
| PostgreSQL | 🟡 | used in Docker; the PC demo uses SQLite (same models and migrations) |
| FFmpeg, faster-whisper, diarisation, configurable summariser, JSON outputs | ✅ | C1 / C2 / BART / optional cloud |
| Docker Compose | ✅ | GPU worker, Ollama, Postgres, Redis, Nginx |
| **Git and GitHub** | ❌ | Git isn't installed on this PC and the project isn't a repository yet |

## 3. Landing page

| Requirement | Status |
|---|---|
| Navigation: Features, How It Works, Research, About, Sign In; mobile menu | ✅ |
| Hero "Turn Meetings Into Actionable Intelligence.", Get Started, Explore How It Works | ✅ |
| Interactive product preview based on the real product (sample data, labelled) | ✅ |
| Features, five-step workflow, evidence-verification demo, research, privacy, FAQ, About, footer | ✅ |
| White/navy with electric blue and violet, reveal animations, reduced-motion support, dark mode | ✅ |
| No invented customers, testimonials, statistics or unimplemented security claims | ✅ |
| Same React project as the app, code-split so visitors don't download the app | ✅ |

## 4. Authentication

| Requirement | Status | Notes |
|---|---|---|
| Register, login, logout, Argon2, expiring JWT, protected routes | ✅ | |
| Server-side ownership checks (no IDOR) | ✅ | tested: other users get 404 |
| Rate limiting | ✅ | added: 10 sign-in attempts/minute per address and per email |
| Validation, loading, empty states, retry | ✅ | |

## 5. Dashboard

| Requirement | Status | Notes |
|---|---|---|
| Meeting history, status, search, upload button | ✅ | |
| Total meetings / status counts / recent summaries panel | ❌ | list only, no statistics cards |
| Filter by status | ❌ | search only |
| Retry from the dashboard | 🟡 | Retry is on the meeting page |

## 6. Upload and processing

| Requirement | Status |
|---|---|
| Type, size (`MAX_UPLOAD_MB`) and 2-hour duration validation, upload progress | ✅ |
| Background jobs, live stage progress (WebSocket), failure reporting, retry, resume from cache | ✅ |
| Safe deletion of files and derived data | ✅ |
| Failed summary never corrupts the transcript; no duplicate summaries | ✅ |

## 7. Transcript

| Requirement | Status | Notes |
|---|---|---|
| Segment ID, start, end, text, speaker | ✅ | |
| Confidence information | ❌ | Whisper's per-segment confidence isn't stored or shown (would also help flag hallucinated lines over music) |
| Honest speaker labels | ✅ | "Speaker 1"; single-speaker notice; names only from file or user |

## 8. Summarisation and evidence engine

| Requirement | Status | Notes |
|---|---|---|
| Structured JSON with references, validated and retried | ✅ | |
| Check referenced segments exist | ✅ | evidence status valid / missing / invalid |
| Semantic comparison, a valid ID is not proof | ✅ | LLM verifier, word-overlap fallback |
| Supported / partial / unsupported | ✅ | |
| **Contradicted** as a separate automatic label | 🟡 | the AI check folds contradiction into "unsupported"; human review has "contradicted" |
| Unsupported claims kept and flagged, not discarded | ✅ | |
| **Agreed decision vs suggestion** | ❌ | prompt says "only agreed decisions", but proposals aren't captured as their own category |
| **Explicitly assigned vs inferred action / owner** | ❌ | owner is left empty unless stated, but there's no "explicit/inferred" flag |
| Explicit vs missing deadline | ✅ | empty deadline = not stated |
| Verifier evaluated against human labels | 🟡 | report script (`research/claim_review_report.py`) ready; human labels not yet collected |
| Verifier repeatability | 🟡 | measured: the same claims scored 33/9/17 and 34/13/12 in two runs |

## 9. Results page

| Requirement | Status | Notes |
|---|---|---|
| Summary, Decisions, Action items, Transcript tabs | ✅ | also Questions & Risks, Insights, Ask, Compare |
| Separate **Overview** and **Evidence review** tabs | ❌ | overview is at the top of Summary; no single "all claims needing review" list |
| Citation → highlighted transcript segment | ✅ | |
| Accessible status labels | 🟡 | wording is "Supported / Partly supported / Not supported", not the prompt's five |
| Corrections keep the original | 🟡 | transcript corrections keep the original; decision/action edits are marked "edited by you" but the earlier text isn't kept |
| Small screens | ✅ | |

## 10–11. Database and API

| Requirement | Status | Notes |
|---|---|---|
| Normalised schema, foreign keys, indexes, migrations | ✅ | |
| Claims and evidence as their own tables | 🟡 | decisions/actions are tables; key points, topics, questions, risks are JSON in `summaries`; reviews are a table |
| Private file storage | ✅ | outside the web root, expiring per-meeting audio links |
| Backup and recovery procedure | ✅ | added in `docs/DEPLOYMENT.md` |
| Development seed data | 🟡 | demo mode (`AI_MODE=fake`) generates a sample meeting; no seed script |
| Documented REST API (OpenAPI at `/docs`) | ✅ | |

## 12. Research and evaluation

| Requirement | Status | Notes |
|---|---|---|
| Research question, C1 vs C2 design, metrics | ✅ | in the spec and `research/README.md` |
| Experiment scripts (E1–E5), AMI loader, run metadata | ✅ | |
| AMI corpus downloaded and experiments run | ❌ | no results exist yet, and none have been invented |
| Human claim labels, inter-rater agreement | ❌ | tooling ready (review buttons, Cohen's kappa); labels not collected |
| User study materials | ✅ | protocol, consent form, questionnaire, SUS scorer |

## 13. Security, privacy and ethics

| Requirement | Status | Notes |
|---|---|---|
| Validation, upload limits, authZ, secrets in `.env`, safe errors | ✅ | |
| Rate limiting | ✅ | new |
| Safe logging | 🟡 | tokens kept out of URLs/logs; no full logging review written up |
| Data kept out of cloud sync | ✅ | moved to `C:\MeetMindData` |
| **Retention settings** (auto-delete after N days) | ❌ | deletion is manual only |
| **Dependency vulnerability checks** | ❌ | CI doesn't run `pip-audit` / `npm audit` |
| Privacy notice / data-flow document, UK GDPR & ethics notes | ❌ | consent form exists; no DPIA or data-flow doc |

## 14. Testing

| Requirement | Status |
|---|---|
| API, auth, ownership, upload validation, evidence integrity, unsupported claims, extraction, retry | ✅ |
| Frontend component tests and end-to-end journeys | ✅ |
| Practical real-AI test | 🟡 real run done and measured, but there's no one-command script in the repo |

## 15. Deployment

| Requirement | Status |
|---|---|
| Deployment architecture, env template, build/start commands, CORS, health check, troubleshooting, rollback | ✅ `docs/DEPLOYMENT.md` |
| Website package for shared hosting | ✅ `deploy/build-website.ps1` |
| Actually deployed and verified online | ❌ needs your domain and Cloudflare account |

## 16. Documentation

| Item | Status |
|---|---|
| README, installation, testing, env example, deployment guide | ✅ |
| Architecture, database schema, API, privacy/data-flow, methodology, evaluation protocol, limitations, future work (as separate documents) | ❌ mostly covered inside the spec PDF and README, not as project documents |
| Academic chapters (proposal, literature review plan, chapter outlines) | ❌ |

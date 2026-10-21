===============================================================================================
 MEETCITE - README
 Evidence-grounded AI meeting minutes: every point cites where it was said, and every point
 is checked.
===============================================================================================

 Project:     MeetCite (formerly "MeetMind"; renamed in October 2026)
 Programme:   MSc Information Technology, University of the West of Scotland
 Group:       Group 8 (2026-27)
 Live site:   https://meetcite.com.ng
 Code:        https://github.com/icon1210/meetcite
 Status:      Working prototype, deployed online. Research evaluation and user study waiting for
              ethical approval.
 Updated:     20 October 2026


-----------------------------------------------------------------------------------------------
 CONTENTS
-----------------------------------------------------------------------------------------------
  1.  What MeetCite is
  2.  The problem it solves
  3.  The team
  4.  Features
  5.  How it works (the processing pipeline)
  6.  Technology used
  7.  Project folders and key files
  8.  Running MeetCite on a laptop
  9.  The live server (meetcite.com.ng)
  10. Backups and restore
  11. Configuration settings
  12. Tests and quality checks
  13. API endpoints
  14. Database
  15. Security
  16. Privacy, ethics and data protection
  17. Research and evaluation
  18. Project documents
  19. Troubleshooting
  20. Known limitations and next steps
  21. Licences and credits
  22. Use of generative AI


===============================================================================================
 1. WHAT MEETCITE IS
===============================================================================================

MeetCite turns a meeting recording into:

  * a transcript labelled by speaker, with timestamps;
  * structured minutes: an overview, key points, topic-by-topic discussion (with each person's
    position and the outcome), decisions, action items (task, owner, deadline), open questions
    and risks;
  * follow-up tools: a follow-up email, calendar reminders for deadlines, and exports to PDF,
    Word and text.

What makes it different is EVIDENCE:

  * every item in the minutes cites the transcript lines it came from;
  * clicking a citation jumps to that moment in the transcript and the recording;
  * an independent second pass checks every item against its cited lines and labels it
    "supported", "partly supported" or "not supported", with a reason;
  * people can record their own judgement of every claim.

Product promise: minutes you can trust, or at least see exactly what to check, in minutes
instead of hours.


===============================================================================================
 2. THE PROBLEM IT SOLVES
===============================================================================================

  * Writing minutes is slow (often an hour or more per meeting) and is often skipped, so
    decisions are forgotten and tasks are dropped.
  * AI summaries help, but language models sometimes state things that were never said
    ("hallucination"): a decision nobody made, a deadline nobody gave, a task given to the wrong
    person. A fluent summary gives no sign of which sentences are reliable.
  * In recurring meetings, actions are not followed up and decisions change without anyone
    noticing.
  * Universities need accurate records (group projects, supervision, committees), must protect
    personal data, and need transcripts and captions for accessibility.

Research question:
  Does asking the AI to cite the transcript lines behind every point (configuration C2,
  "evidence-grounded") reduce unsupported statements compared with an ordinary AI summary
  (configuration C1, "plain")? Both use the same model, the same transcript and the same output
  fields; only the citation instruction differs.


===============================================================================================
 3. THE TEAM (GROUP 8)
===============================================================================================

  Oguanya Kenneth Ifeanyi    Group Lead and Database Lead
                             Database design, accounts and login, migrations, backups,
                             data protection; leads the group and the final report.

  Olayinka Williams Ajibola  Project Design Lead (System and UI/UX)
                             System architecture, AI summaries and the AI check, series memory,
                             live captions, the web app and its design.

  Iloanugo Onyeka Pascal     AI Evaluation Lead
                             Transcription and speaker identification; the C1 vs C2 evaluation,
                             evaluation scripts and results.

  Emmanuel Chieji            Testing, Security and Deployment Lead
                             Media processing (audio/video conversion), automated tests,
                             security checks, monitoring and deployment.

  Chinonye Linda Nwanya      Exports and Usability Lead
                             PDF/Word/text exports, follow-up email and calendar reminders,
                             the ethics application, user guide and usability study.

Detailed responsibilities, deliverables and the 15-week plan are in the group's task
allocation document (MeetCite_Task_Allocation).


===============================================================================================
 4. FEATURES
===============================================================================================

 CAPTURE
  * Upload recordings: MP3, WAV, M4A, MP4, WebM; up to 2 hours and 1 GB.
  * Record a Teams, Zoom or Google Meet call in the browser (Chrome or Edge), from shared
    tab/screen audio and/or the microphone, with a sound-level meter.
  * Recording cannot start until the user confirms everyone has been told and agrees; a visible
    recording indicator stays on screen and in the browser tab.
  * Live captions and "quick notes" (likely decisions, actions and questions) while recording,
    in cloud mode. The browser gets a 60-second token; the API key never leaves the server.
  * Optional Teams/Zoom transcript file (.vtt) to label speakers with their real names.
  * Optional meeting series and agenda when uploading.

 PROCESSING
  * Converts any input to clean 16 kHz mono audio.
  * Speech to text with word timestamps; separates speakers; joins words and speakers into
    transcript lines.
  * Suggests speaker names from self-introductions ("I'm Priya"); never applies them without
    the user's confirmation.
  * Writes minutes in which every item cites transcript line numbers (C2).
  * Checks every item against its cited lines (the "AI check"), and shows which method was used.
  * Live progress by stage; processing continues if the user leaves the page; a retry resumes
    from the last completed step; a chime and notification when ready.

 REVIEWING THE RESULTS (meeting page tabs)
  * Summary: overview, key points and detailed topic minutes, each with citations and check
    results; an "AI-generated" label and a "Review flagged" shortcut.
  * Action items: owner, deadline, status; edit, add, mark done.
  * Decisions.
  * Questions and risks.
  * Evidence review: claims needing attention first; record a human label for each claim
    (supported, partial, unsupported, contradicted, unclear).
  * Follow-up: agenda check (covered / partly / not covered), follow-up email, calendar (.ics)
    reminders. Deadlines as spoken ("next Friday") become dates; vague ones ("soon") never do.
  * Series memory: actions still open from earlier meetings, progress hints, changed decisions.
  * Transcript: search, edit text (the original is kept), rename speakers, accept suggestions.
  * Compare: plain (C1) and evidence-grounded (C2) minutes side by side; generate C1 here.
  * Insights: counts, actions with no owner, participation by speaker, reliability summary.
  * Ask: questions about the meeting answered only from the transcript, with sources.
  * Audio player with waveform; clicking a citation plays from that moment.
  * Export: PDF, DOCX, TXT, with an AI notice and flags on unsupported points.

 ACROSS MEETINGS
  * Meeting series page: one action tracker (filter by owner), decision history timeline,
    changes, list of meetings, and questions answered across all meetings with sources.
  * Dashboard: a "Needs your attention" list ranking meetings by what needs doing (failed
    processing, overdue actions, decisions changed since an earlier meeting, claims nobody has
    checked, actions with no owner, actions due soon), each reason opening the right tab;
    statistics, series, actions due soon, and a searchable library with a "Needs attention" filter.

 ACCOUNTS AND INTERFACE
  * Register, log in, log out; optional sign-up code so only invited people can create accounts.
  * Delete a meeting and all its data permanently.
  * Landing page with product preview, specifications, privacy information, FAQs and the team.
  * "Mindy", an animated mascot who shows status and explains errors in plain language.
  * Light and dark themes; works at phone width (recording needs a desktop browser).


===============================================================================================
 5. HOW IT WORKS (THE PROCESSING PIPELINE)
===============================================================================================

  Stage           Progress   What happens                          Local mode       Cloud mode
  --------------  ---------  ------------------------------------  ---------------  -----------
  1 Preprocessing   0-5%     FFmpeg converts to 16 kHz mono WAV,   FFmpeg (+volume  FFmpeg
                             checks length                         normalisation)
  2 Transcribing    5-55%    Speech to timed words                 faster-whisper   AssemblyAI
  3 Diarizing      55-75%    Who spoke when                        pyannote.audio   AssemblyAI
  4 Aligning       75-78%    Words to speakers; new line after a   MeetCite code    MeetCite code
                             2 s pause or at 30 s
  5 Summarizing    78-93%    Cited minutes (map-reduce over         Ollama model     Claude
                             chunks; JSON validated, retried)
  6 Verifying      93-100%   Each item checked against its lines   Ollama, or word  Claude
                                                                   overlap fallback

 How the minutes are written (stage 5)
  * Filler words ("um", "you know") and repeated words are removed from the text the AI sees
    only; the stored transcript keeps them.
  * The transcript is split into chunks that fit the model, at line boundaries, with 2 lines of
    overlap. Lines are numbered: "[42] Kenneth: ...".
  * Map: each chunk produces partial notes as JSON, every item citing line numbers.
    Reduce: the partial notes are merged (in groups if needed) into the final minutes.
  * Every reply must match a strict JSON schema (checked with Pydantic); invalid replies are
    retried with the error message. Valid replies are cached, so a retry resumes.
  * Each item's citations are marked valid, missing (none) or invalid (non-existent lines).

 How the AI check works (stage 6)
  * Each claim is shown to the model with only its cited lines (plus one neighbouring line
    either side for context) and labelled supported / partial / unsupported, with a reason of
    up to 20 words.
  * If no model is available, a transparent word-overlap check is used (60% or more of the key
    words found = supported, 30% or more = partial) and the interface says so.

 Measured speed: an 88-minute meeting was processed end to end in about 3 minutes in cloud mode
 (preparation 5 s, transcription 98 s, minutes 45 s, check 18 s).


===============================================================================================
 6. TECHNOLOGY USED
===============================================================================================

  Web app      React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, react-router,
               WaveSurfer.js (waveform), lucide icons. React produces the HTML; Tailwind is CSS.
  API          Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, Uvicorn.
  Jobs         Background thread inside the API (default), or Celery + Redis.
  Database     SQLite (default and on the live server) or PostgreSQL (Docker GPU set-up).
  Audio        FFmpeg / ffprobe.
  Local AI     faster-whisper (Whisper large-v3-turbo), pyannote.audio 3.1, Ollama (Llama 3.1 8B),
               optional BART summariser.
  Cloud AI     AssemblyAI (speech, speakers, live captions), Anthropic Claude (claude-opus-5-5)
               for minutes and checks.
  Security     Argon2 password hashing, JWT (PyJWT), rate limiting.
  Exports      python-docx, WeasyPrint (PDF), fpdf2 (PDF fallback).
  Hosting      Docker Compose, nginx (web app), Caddy (automatic HTTPS from Let's Encrypt).
  Testing      pytest, ruff, mypy; Vitest + React Testing Library; Playwright; GitHub Actions.


===============================================================================================
 7. PROJECT FOLDERS AND KEY FILES
===============================================================================================

  backend/                         Python API and AI pipeline
    app/main.py                    Starts the API; /api/health and /api/config
    app/config.py                  All settings (read from environment / .env)
    app/models.py                  Database tables
    app/schemas.py                 Request and response shapes
    app/security.py                Password hashing and login/audio tokens
    app/ratelimit.py               Sign-in/sign-up rate limiting
    app/deps.py                    Current user, ownership checks
    app/export.py                  PDF, Word and text exports
    app/jobs.py, app/worker/       Background processing (thread or Celery)
    app/routers/                   API endpoints: auth, meetings, edits, claims, series, live
    app/pipeline/preprocess.py     FFmpeg conversion and length checks       (Emmanuel)
    app/pipeline/transcribe.py     Local speech to text (faster-whisper)     (Pascal)
    app/pipeline/cloud_transcribe.py  AssemblyAI transcription + live tokens (Pascal)
    app/pipeline/diarize.py        Local speaker separation (pyannote)       (Pascal)
    app/pipeline/align.py          Words to speakers, transcript lines       (Pascal)
    app/pipeline/names.py          Real names from .vtt and introductions    (Pascal)
    app/pipeline/chunking.py       Cleaning and chunking                     (Olayinka)
    app/pipeline/summarize_llm.py  Cited minutes, C1 and C2 prompts          (Olayinka)
    app/pipeline/verify.py         The AI check                              (Olayinka)
    app/pipeline/continuity.py     Series memory and agenda check            (Olayinka)
    app/pipeline/runner.py         Runs the six stages in order              (Olayinka)
    app/pipeline/ask.py            Questions answered from the transcript
    app/pipeline/extract_rules.py  Keyword rules (quick notes, fallback)
    app/pipeline/llm_clients.py    Talking to Ollama or Claude
    app/pipeline/fake.py           Demo mode (fixed sample meeting)
    alembic/versions/              Database migrations 0001-0004              (Kenneth)
    tests/                         85 automated backend tests

  frontend/                        React web app
    src/pages/                     Landing, auth, dashboard, upload, record, meeting, series
    src/components/meeting/        The meeting page tabs (FollowUpTab.tsx is Chinonye's)
    src/components/Buddy.tsx       Mindy the mascot
    src/components/LiveCaptions.tsx  Live captions and quick notes
    src/lib/api.ts                 Calls to the API
    src/lib/useRecorder.ts         Browser recording (+ 16 kHz audio for captions)
    src/lib/useLiveCaptions.ts     Live captions connection
    src/lib/deadlines.ts           Spoken deadlines to dates; calendar files   (Chinonye)
    src/test/                      34 unit tests
    e2e/meetcite.spec.ts           5 end-to-end browser tests (also take screenshots)
    e2e/responsive.spec.ts         Every page and tab must fit 11 screen widths (320-1920px)

  research/                        Evaluation scripts (E1-E5), AMI download, SUS scoring,
                                   user_study/ (protocol, consent form, questionnaire)
  deploy/                          Server package script, Caddy config, backup script,
                                   shared-hosting files
  docs/                            DEPLOYMENT.md, AUDIT.md, this README, group documents
  models/                          Downloaded AI models (not in Git)
  docker-compose.yml               Full local set-up with GPU (PostgreSQL, Redis, Ollama)
  docker-compose.cloud.yml         Cloud-mode server set-up (used on meetcite.com.ng)
  .env.example, .env.cloud.example Settings templates (no real keys)
  start-meetcite.ps1               Starts everything on the Windows laptop
  .github/workflows/ci.yml         Automatic checks on every push


===============================================================================================
 8. RUNNING MEETCITE ON A LAPTOP
===============================================================================================

 A. Quickest way to try the interface (no AI, no GPU)
    Set AI_MODE=fake in backend/.env. Every upload returns the same sample meeting. Used for
    demos and the automated tests.

 B. Windows, development set-up
    1. Install tools (PowerShell):
         winget install Python.Python.3.11 Gyan.FFmpeg Ollama.Ollama Git.Git
       Reopen the terminal, then (for local AI):  ollama pull llama3.1:8b
    2. Backend:
         cd backend
         py -3.11 -m venv .venv
         .venv\Scripts\pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121
         .venv\Scripts\pip install -r requirements-ml.txt -r requirements-dev.txt
       Create backend\.env with at least SECRET_KEY=... (and HF_TOKEN=... for local speaker
       separation, or the cloud settings below). Then:
         .venv\Scripts\python -m uvicorn app.main:app --port 8000
    3. Web app (second terminal):
         cd frontend
         npm install
         npm run dev
       Open http://localhost:5173 . API documentation: http://localhost:8000/docs
    4. Day-to-day: run .\start-meetcite.ps1 from the project folder.
       (If PowerShell blocks scripts: powershell -ExecutionPolicy Bypass -File .\start-meetcite.ps1)

 C. Cloud AI on the laptop (fast, no GPU needed)
    In backend\.env:  AI_PROVIDER=cloud, ASSEMBLYAI_API_KEY=..., ANTHROPIC_API_KEY=...

 D. Full local set-up with Docker and a GPU
    Copy .env.example to .env (SECRET_KEY, POSTGRES_PASSWORD, HF_TOKEN), then:
         docker compose up -d --build
    Open http://localhost:8080

 Keep data out of OneDrive: on this laptop the data lives in C:\MeetMindData (database
 meetmind.db, recordings, working files), set by DATA_DIR and DATABASE_URL in backend\.env.
 The folder keeps its old name on purpose so existing meetings stay connected.


===============================================================================================
 9. THE LIVE SERVER (meetcite.com.ng)
===============================================================================================

  Server      Bluehost VPS (Standard VPS NVMe 2): Ubuntu 26.04, 1 vCPU, 2 GB RAM + 2 GB swap,
              50 GB disk.
  Domain      meetcite.com.ng, registered through HostAfrica / Domain King. In its DNS
              Management, the "@" and "www" A records point to the VPS; "pop" and "smtp" are left
              on the HostAfrica mail server. (The HostAfrica web-hosting plan itself cannot run
              MeetCite: it is shared hosting with no server access.)
  Set-up      Docker Compose with docker-compose.cloud.yml in /opt/meetcite (a clone of the
              GitHub repository): api + frontend (nginx) + caddy (HTTPS).
  AI mode     Cloud (AssemblyAI + Claude). Sign-up code required to create accounts.
  Settings    /opt/meetcite/.env on the server (DOMAIN, SECRET_KEY, REGISTRATION_CODE,
              ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY, CLOUD_LLM_EFFORT). Readable by root only.
              Never put this file in Git or share it.
  HTTPS       Automatic certificates from Let's Encrypt for meetcite.com.ng and
              www.meetcite.com.ng, renewed automatically. http:// and www redirect to
              https://meetcite.com.ng.
  Firewall    Only ports 22 (secure login, rate-limited), 80 and 443 are open.
  Restarts    All parts restart automatically after a crash or server reboot.

 Common commands (log in first: ssh root@<server IP>):
    Status:   cd /opt/meetcite && docker compose -f docker-compose.cloud.yml ps
    Logs:     docker compose -f docker-compose.cloud.yml logs -f api
    Update:   cd /opt/meetcite && git pull && docker compose -f docker-compose.cloud.yml up -d --build
    Restart:  docker compose -f docker-compose.cloud.yml restart
    Edit settings:  nano /opt/meetcite/.env   then run the Update command

 Access: the server accepts a key-based login from the project laptop (key file
 C:\Users\PC\.ssh\meetcite_deploy). To remove that access, delete the "meetcite-deploy" line from
 /root/.ssh/authorized_keys on the server.

 Full step-by-step guide (including other hosting options): docs/DEPLOYMENT.md


===============================================================================================
 10. BACKUPS AND RESTORE
===============================================================================================

  * Every night at 02:30 (server time, UTC), /usr/local/bin/meetcite-backup.sh:
      - takes a consistent snapshot of the database using SQLite's online backup (safe while
        MeetCite runs);
      - packs it with the uploaded recordings into one compressed archive;
      - checks that the archive can be read back;
      - keeps the last 7 daily and 4 weekly (Sunday) archives in /var/backups/meetcite;
      - skips the backup rather than fill the disk if less than 2 GB is free.
  * Scheduled by /etc/cron.d/meetcite-backup. Log: /var/log/meetcite-backup.log
    ("OK" or an error per run). Check with:  tail /var/log/meetcite-backup.log
  * A test restore was carried out on 20 October 2026: integrity "ok", all 12 tables present.
  * The script is in the repository: deploy/cloud/meetcite-backup.sh

 Restore (replaces the current data):
    cd /opt/meetcite && docker compose -f docker-compose.cloud.yml stop api
    V=$(docker volume inspect -f '{{.Mountpoint}}' meetcite_meetcite-data)
    tar -xzf /var/backups/meetcite/daily/meetcite-YYYY-MM-DD_HHMM.tar.gz -C "$V"
    docker compose -f docker-compose.cloud.yml start api

 Important: these backups are on the same server. Copy one off the server regularly, e.g.:
    scp root@<server IP>:/var/backups/meetcite/daily/<newest file>.tar.gz .


===============================================================================================
 11. CONFIGURATION SETTINGS
===============================================================================================

 All settings are environment variables (backend\.env on the laptop, /opt/meetcite/.env on the
 server). Defaults are in backend/app/config.py.

  Setting                     Default                    Meaning
  --------------------------  -------------------------  --------------------------------------
  SECRET_KEY                  (must be set)              Signs login tokens. Long and random.
  ENVIRONMENT                 development                development / production / test
  REGISTRATION_CODE           (empty = open sign-up)     Code needed to create an account
  ACCESS_TOKEN_EXPIRE_MINUTES 60                         How long a login lasts
  AUTH_ATTEMPTS_PER_MINUTE    10                         Sign-in/sign-up attempts per minute
  TRUSTED_PROXY_HEADER        (none)                     Real visitor IP behind a proxy
  CORS_ORIGINS                http://localhost:5173      Websites allowed to call the API
  DATABASE_URL                sqlite:///./data/meetcite.db  Database location
  DATA_DIR                    ./data                     Recordings and working files
  MAX_UPLOAD_MB               1024                       Largest upload
  MAX_DURATION_S              7200                       Longest recording (2 hours)
  TASK_MODE                   thread                     thread or celery (with REDIS_URL)
  AI_MODE                     real                       real, or fake (demo/tests)
  AI_PROVIDER                 local                      local (GPU) or cloud (AssemblyAI+Claude)
  DEVICE                      cuda                       cuda (GPU) or cpu, for local mode
  WHISPER_MODEL               large-v3-turbo             Local speech model size
  WHISPER_COMPUTE_TYPE        int8_float16               Local speech model precision
  WHISPER_BATCH_SIZE          16                         Speech regions decoded at once (GPU)
  WHISPER_BEAM_SIZE           1                          Speech search width (higher = slower)
  HF_TOKEN                    (none)                     Needed for local speaker separation
  DIARIZATION_MODEL           pyannote/speaker-diarization-3.1
  OLLAMA_URL / OLLAMA_MODEL   localhost:11434 / llama3.1:8b   Local language model
  BART_MODEL                  facebook/bart-large-cnn    Optional BART summariser
  DEFAULT_SUMMARIZER          llm                        llm (C2), bart, or cloud
  LLM_CONTEXT_TOKENS          8192                       Local model context size
  LLM_MAX_OUTPUT_TOKENS       4096                       Local model reply limit
  LLM_MAX_RETRIES             3                          Retries for invalid AI replies
  VERIFY_WITH_LLM             true                       Use the model for the AI check
  ASSEMBLYAI_API_KEY          (none)                     Cloud speech key
  ASSEMBLYAI_BASE_URL         https://api.assemblyai.com  EU: https://api.eu.assemblyai.com
  ANTHROPIC_API_KEY           (none)                     Claude key
  CLOUD_LLM_MODEL             claude-opus-5-5            Claude model
  CLOUD_LLM_EFFORT            low                        low (fastest) ... max
  CLOUD_LLM_ENABLED           false                      Optional Claude comparison in local mode

 Never commit real keys. The .env files are excluded from Git.


===============================================================================================
 12. TESTS AND QUALITY CHECKS
===============================================================================================

  Check                         Command                                        Result (Oct 2026)
  ----------------------------  ---------------------------------------------  ----------------
  Backend tests (pytest)        cd backend; .venv\Scripts\python -m pytest     85 passing
  Backend lint and format       ruff check app tests; ruff format --check      clean
  Backend types                 mypy app                                       clean
  Web app unit tests (Vitest)   cd frontend; npm test                          34 passing
  Web app lint / types / build  npm run lint; npm run typecheck; npm run build clean
  End-to-end (Playwright)       npm run e2e  (stop the laptop's MeetCite API   6 passing
                                first; the tests start their own in demo mode)

 What the tests cover: alignment and chunking, JSON validation and retries, map-reduce
 summarisation, citation checks, the AI check and its fallback, series memory and agenda checks,
 live-caption tokens and quick notes, cloud transcription parsing, authentication, sign-up code,
 rate limiting, access control between users, upload validation, editing, exports, regeneration,
 Q&A, audio tokens, deletion, deadline parsing and calendar files, and the full journey in a real
 browser (register, upload, citations, names, review, C1 vs C2, actions, export, delete,
 recording consent, series memory, landing page).

 GitHub Actions runs lint, type checks, tests and a production build on every push.
 The end-to-end tests save screenshots to frontend/test-results/screens/ (used in the PRD).


===============================================================================================
 13. API ENDPOINTS
===============================================================================================

 Interactive documentation: http://localhost:8000/docs (laptop). All endpoints except health,
 config, register and login need a login token.

  System     GET  /api/health                       Server is up
             GET  /api/config                       Available options (AI mode, limits, ...)
  Accounts   POST /api/auth/register                Create account (sign-up code if set)
             POST /api/auth/login                   Log in
             GET  /api/auth/me                      Current user
  Meetings   GET  /api/meetings                     List / search
             POST /api/meetings                     Upload (file, title, series, agenda, .vtt)
             GET  /api/meetings/{id}                Everything about a meeting
             PATCH /api/meetings/{id}               Rename, edit key points, series, agenda
             DELETE /api/meetings/{id}              Delete meeting and all its data
             GET  /api/meetings/{id}/status         Progress
             WS   /api/meetings/{id}/progress       Live progress (WebSocket)
             POST /api/meetings/{id}/retry          Retry after a failure
             POST /api/meetings/{id}/regenerate     Generate another configuration (e.g. C1)
             POST /api/meetings/{id}/summaries/{sid}/activate   Use a version
             POST /api/meetings/{id}/memory         Re-check series memory and agenda
             GET  /api/meetings/{id}/export?format= pdf | docx | txt
             GET  /api/meetings/{id}/media          Audio link and waveform
             GET  /api/meetings/{id}/audio          Audio stream (scoped token)
             POST /api/meetings/{id}/action-items   Add an action item
             POST /api/meetings/{id}/ask            Ask a question about the meeting
  Edits      GET  /api/action-items                 Open actions across all meetings
             PATCH /api/speakers/{id}               Rename speaker
             PATCH /api/segments/{id}               Correct transcript text / speaker
             PATCH|DELETE /api/decisions/{id}       Edit / delete a decision
             PATCH|DELETE /api/action-items/{id}    Edit / complete / delete an action
  Reviews    POST /api/claims/{type}/{id}/review    Record a human label for a claim
  Series     GET|POST /api/series                   List / create series
             GET|PATCH|DELETE /api/series/{id}      View / rename / delete (meetings kept)
             POST /api/series/{id}/ask              Ask across all meetings in a series
  Live       POST /api/live/token                   60-second token for live captions
             POST /api/live/notes                   Quick notes from caption text


===============================================================================================
 14. DATABASE
===============================================================================================

 SQLite file (meetcite.db) by default, through SQLAlchemy; PostgreSQL also supported. Changes to
 the structure are Alembic migrations, applied automatically when the API starts.

  Table            Holds
  ---------------  ------------------------------------------------------------------------
  users            name, email, hashed password
  series           recurring meeting groups (per user)
  meetings         title, file, status, source, agenda, series
  jobs             progress, stage timings, warnings, errors (one per meeting)
  speakers         labels, real names, name suggestions
  segments         transcript lines: time, speaker, text, original text if corrected, words
  summaries        one per configuration (C1/C2): minutes, AI check results, series memory,
                   agenda review, model and prompt version, timings
  decisions        linked to a summary, with citations and check result
  action_items     task, owner, deadline, status, citations, check result
  claim_reviews    human labels for the evaluation
  evaluation_runs  records of evaluation runs
  alembic_version  migration version (currently 0004)

 Deleting a user deletes their meetings; deleting a meeting deletes its transcript, speakers,
 summaries, decisions, actions and files (ON DELETE CASCADE). Deleting a series keeps its
 meetings (SET NULL).


===============================================================================================
 15. SECURITY
===============================================================================================

  * Passwords hashed with Argon2; never stored as text.
  * Login tokens are signed JWTs that expire after 60 minutes.
  * Audio links use a separate token valid for one meeting for 6 hours; it cannot be used to log in.
  * The same message for an unknown email and a wrong password.
  * Rate limiting: 10 sign-in/sign-up attempts per minute per address and per email (HTTP 429).
  * Optional sign-up code, compared in constant time.
  * Every request checks the meeting belongs to the logged-in user.
  * API keys only in .env on the server; never in the browser or in Git. Live captions use a
    60-second token issued by the server.
  * HTTPS with HSTS on the live site; firewall allows only ports 22, 80 and 443.
  * The WebSocket progress stream sends the login token as a message, not in the URL.


===============================================================================================
 16. PRIVACY, ETHICS AND DATA PROTECTION
===============================================================================================

  Data                    Where it goes                                     Kept until
  ----------------------  ------------------------------------------------  -----------------
  Account                 MeetCite database                                 account deleted
  Recording               Server disk. Cloud mode: compressed audio sent    meeting deleted
                          to AssemblyAI. Local mode: never leaves server.
  Transcript and minutes  MeetCite database. Cloud mode: text sent to       meeting deleted
                          Anthropic (Claude).
  Live caption audio      Streamed from the browser to AssemblyAI           not stored
  Human claim labels      MeetCite database                                 with the meeting

  * Consent before recording; covert recording is out of scope.
  * Processing location disclosed on the landing page and FAQ; a short privacy note under the
    upload buttons.
  * UK GDPR principles: data minimisation, storage limitation, right to erasure (delete meeting).
  * Research ethics: no participant testing or new recordings for research until university
    ethical approval is granted (it cannot be granted after the fact). The supervisor is
    confirming the route for recording and storage. Use the public AMI Meeting Corpus for the
    accuracy evaluation wherever possible.
  * User study design: participants review one pre-processed AMI meeting with code-only test
    accounts; nobody is recorded and no participant data reaches the cloud services. Ethics
    documents: docs/ethics/ (Participant Information Sheet, Consent Form, Study Protocol and
    Questionnaire, form answers).


===============================================================================================
 17. RESEARCH AND EVALUATION
===============================================================================================

 Scripts in research/ call the same pipeline code as the web app (details: research/README.md):

  Script                       Measures
  ---------------------------  ----------------------------------------------------------------
  ami.py                       Downloads the AMI Meeting Corpus (20 test meetings with audio)
  e1_transcription.py          Word error rate (jiwer) and speed by Whisper size
  e2_diarization.py            Diarization error rate (pyannote.metrics, 0.25 s collar)
  e3_summarization.py          ROUGE and BERTScore against human AMI summaries
  e4_hallucination_sheet.py    Blind labelling sheet (models hidden as M1, M2), then scoring
  e5_speed.py                  Seconds per stage for 15, 30 and 60-minute meetings
  claim_review_report.py       Summarises human claim labels from the app
  sus_score.py                 System Usability Scale scores from the user study
  finetune_bart_ami.py         Optional BART fine-tuning on AMI

 Targets: C2 has a lower unsupported-claim rate than C1; the AI check agrees with human labels
 (Cohen's kappa 0.6 or more); usability (SUS) 75 or more; under 5 minutes per hour of audio in
 cloud mode.


===============================================================================================
 18. PROJECT DOCUMENTS
===============================================================================================

  docs/DEPLOYMENT.md               How to put MeetCite online, backups, configuration
  docs/AUDIT.md                    What is and isn't built, against the specification
  docs/MeetCite_PRD.pdf            Product Requirements Document with screenshots (28 pages)
  docs/MeetCite_Task_Allocation    Who owns what, plan, contribution log (Word; also online)
  docs/MeetCite_Viva_Guides        Plain-English guide per member with viva questions (PDF/Word)
  docs/MeetCite_updated.docx       Project summary for the lecturer
  research/README.md               Experiments and method notes
  research/user_study/             Protocol, consent form, questionnaire

 University requirements (MSc Masters Project Handbook 2026-27): individual specification (20%);
 one group report of about 7,500 words plus a 1,000-word Critical Self-Evaluation per student
 (60%); viva with software demonstration, assessed individually (20%); code in a public
 repository; ethical approval before work with participants; declaration of generative AI use.
 Group documents with names and student IDs are kept out of Git and out of the server package.


===============================================================================================
 19. TROUBLESHOOTING
===============================================================================================

  Problem                                   What to do
  ----------------------------------------  ----------------------------------------------------
  Laptop site doesn't open                  Run start-meetcite.ps1; keep the "MeetCite API" and
                                            "MeetCite Web" windows open.
  "Running scripts is disabled"             powershell -ExecutionPolicy Bypass -File <script>
  Local processing very slow                Plug the laptop in and use Turbo/performance mode;
                                            or use cloud mode.
  Recording: "No call audio was shared"     Share the meeting tab or Entire screen and tick
                                            "Share tab audio" / "Share system audio".
  Everything is one speaker (local mode)    Set HF_TOKEN and accept pyannote's terms on
                                            huggingface.co.
  "AssemblyAI rejected the API key"         Check the key in .env (no spaces or quotes).
  Live captions unavailable                 Only in cloud mode with an AssemblyAI key.
  Can't create an account                   The sign-up code is required; ask the group lead.
  End-to-end tests fail at start            Stop the laptop's MeetCite API first (port 8000).
  Live site down                            ssh in; docker compose -f docker-compose.cloud.yml ps
                                            and ... logs api. Then the Update command.
  HTTPS certificate not issued              Check the @ and www A records point to the VPS.
  Backup log shows SKIPPED                  Less than 2 GB free on the server: free disk space.


===============================================================================================
 20. KNOWN LIMITATIONS AND NEXT STEPS
===============================================================================================

 Limitations
  * English only; recordings up to 2 hours.
  * The AI check is itself an AI and can be wrong (hence human review and the agreement study).
  * Speaker separation struggles with people talking over each other.
  * Cloud mode sends audio and text to third parties (disclosed; local mode avoids it).
  * One server; in-memory rate limiting; each account's meetings are private (no team spaces).
  * Recording needs Chrome or Edge on a desktop.

 Next steps
  * Accept MOV and MKV uploads.
  * Account deletion from the app.
  * Accessibility audit (WCAG 2.2 AA), monitoring and uptime alerts, load test.
  * Regular off-server backup copies.
  * Supervisor-meeting export in the UWS Project Process Documentation template.
  * After ethical approval: user study (SUS) and the C1 vs C2 evaluation.


===============================================================================================
 21. LICENCES AND CREDITS
===============================================================================================

  * AMI Meeting Corpus: CC BY 4.0 (Carletta et al., 2005).
  * Whisper: MIT. pyannote.audio: MIT (gated model). BART: MIT. Llama 3.1: Llama 3.1 Community
    Licence. AssemblyAI and Anthropic Claude: used under their API terms.
  * Hero photo: Julia Lopez on Unsplash (Unsplash Licence), credited on the site.
  * Icons: lucide (ISC licence).


===============================================================================================
 22. USE OF GENERATIVE AI
===============================================================================================

 MeetCite uses AI services as parts of the system (AssemblyAI for speech, Anthropic Claude or a
 local Llama model for the minutes and the AI check), as described above. Generative AI
 (Anthropic's Claude, via Claude Code) was also used as a coding assistant in building the
 software, under the group's direction. This must be stated in the University's "Declaration of
 originality and use of generative AI" submitted with the report.

===============================================================================================
 End of README
===============================================================================================

# Deploying MeetCite

There are two ways to run MeetCite's AI, chosen with `AI_PROVIDER` in the settings:

| | **Cloud AI** (`AI_PROVIDER=cloud`) | **Local AI** (`AI_PROVIDER=local`) |
|---|---|---|
| Speech-to-text and speakers | AssemblyAI | Whisper + pyannote on your GPU |
| Minutes and evidence checks | Claude (Anthropic API) | Llama via Ollama on your GPU |
| Server needed | Any small Linux server, no graphics card | A machine with an NVIDIA GPU |
| Running cost | Pay per use (see below) | Electricity; free software |
| Privacy | Recordings go to AssemblyAI and transcripts to Anthropic - tell users, cover it in the ethics approval | Nothing leaves your machine |

## Cloud AI on a VPS (simplest way to put MeetCite online)

Shared hosting such as HostAfrica's DirectAdmin plans can serve websites, but it can't run
MeetCite's Python API: it needs a process that stays running for background jobs, FFmpeg and
WebSockets. A **VPS** (a small virtual server you control) can, and with cloud AI it needs no GPU.
For example HostAfrica's Linux cloud/VPS plans; any Ubuntu server with 1-2 GB RAM and 20 GB disk works.

**Costs (check current prices before relying on them):** the VPS monthly fee, plus per meeting
roughly AssemblyAI ~$0.17-0.23 per hour of audio (with speaker labels) and Claude a few tens of cents
per hour-long meeting (Claude Opus 5.5 is $4 per million input tokens and $20 per million output
tokens; an hour of meeting is about 15,000 tokens of transcript).

### 1. Get the two API keys
- AssemblyAI: sign up at https://www.assemblyai.com, then Dashboard -> API keys.
- Anthropic: sign up at https://console.anthropic.com, add billing, then Settings -> API keys.

### 2. Get the server and point a name at it
1. Order a Linux VPS with **Ubuntu 24.04**. Note its IP address and root password/SSH key.
2. Buy a domain for MeetCite (any registrar, e.g. Namecheap, Porkbun or HostAfrica). In that
   registrar's **DNS settings**, add two **A records** pointing at the VPS IP:
   - host `@` (the bare domain, e.g. `yourmeetcite.com`) -> the VPS IP
   - host `www` -> the VPS IP

### 3. Package MeetCite on your PC
In PowerShell, in the `MeetCite` folder:

```bash
.\deploy\make-server-package.ps1
```

This creates `deploy\meetcite-server.zip` (about 0.5 MB). It never contains your `.env` files,
API keys, recordings or database.

### 4. Upload it to the server
Still in PowerShell on your PC (replace the IP; type `yes` the first time, then the root password):

```bash
scp .\deploy\meetcite-server.zip root@YOUR.VPS.IP:/opt/
```

### 5. Install and start MeetCite on the server
Log in to the server:

```bash
ssh root@YOUR.VPS.IP
```

Then run these one at a time on the server:

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
apt-get install -y unzip && cd /opt && unzip -o meetcite-server.zip && cd meetcite
```

```bash
cp .env.cloud.example .env && nano .env
```

In the editor fill in:
- `DOMAIN=yourmeetcite.com` (your new domain, without https://)
- `SECRET_KEY=` a long random string (run `openssl rand -base64 48` in another window and paste it)
- `REGISTRATION_CODE=` a word you'll give to the people allowed to sign up
- `ASSEMBLYAI_API_KEY=` and `ANTHROPIC_API_KEY=` (the same keys as on your PC, or new ones)

Save with Ctrl+O, Enter, then exit with Ctrl+X. Start everything (the first build takes a few minutes):

```bash
docker compose -f docker-compose.cloud.yml up -d --build
```

Open https://yourmeetcite.com - the HTTPS certificate is issued automatically on the first
visit (give the DNS record from step 2 up to an hour to spread first).

### 6. Check it works
1. The landing page loads over https, and its privacy section says the cloud services are in use.
2. Create an account (you'll be asked for the sign-up code), upload a short recording, and wait for the chime.
3. On the server, `docker compose -f docker-compose.cloud.yml ps` shows `api`, `frontend` and `caddy` running.

**Update later:** run `make-server-package.ps1` again, `scp` the zip, then on the server
`cd /opt && unzip -o meetcite-server.zip && cd meetcite && docker compose -f docker-compose.cloud.yml up -d --build`
(your `.env` and all meetings are kept).
**Logs:** `docker compose -f docker-compose.cloud.yml logs -f api`.
**Backup:** `docker run --rm -v meetcite_meetcite-data:/d -v $PWD:/b alpine tar czf /b/backup.tgz -C /d .`

### Trying cloud mode on your PC first
In `backend\.env`, uncomment `AI_PROVIDER=cloud` and paste the two keys, then restart MeetCite.
Nothing else changes; the graphics card is no longer used.

---

The sections below are for **local AI** (your own GPU).

MeetCite has two very different parts, and they need different kinds of hosting:

| Part | What it is | What it needs |
|---|---|---|
| **Website** (`frontend/`) | HTML, CSS and JavaScript files | Any web host that serves files over HTTPS. Shared hosting such as HostAfrica is fine. |
| **API + AI** (`backend/`) | FastAPI, the database, recordings, Whisper, Llama | A machine with an **NVIDIA GPU (6 GB+)**, ~15 GB of disk for models, and long-running background jobs. |

Shared hosting (HostAfrica DirectAdmin, cPanel and similar) **cannot run the AI part**. It has no GPU,
limits CPU and memory per account, and stops long-running processes. Even with a Python app
selector, Whisper large-v3 and Llama 3.1 8B would not fit or would be stopped mid-meeting.
Free tiers of Vercel, Render and Railway have the same problem: no GPU and short request/job limits.
Swapping in a paid cloud AI API would send recordings to a third party, which the spec (§13) and
the university ethics approval would then have to cover.

## Alternative: website on shared hosting, AI on your own PC

```
 Browser ──HTTPS──► yourmeetcite.com            (shared hosting: static website files)
    │
    └──HTTPS──► api.<your-domain>  ──Cloudflare Tunnel──► your PC: MeetCite API + RTX 2060
```

* **Cost:** a shared hosting plan, your domain and a free Cloudflare account. No GPU rental.
* **Privacy:** recordings and transcripts never leave your PC except to the person viewing them.
* **Limits:** your PC must be on, awake and online during use. Processing speed is what you measured
  (roughly real time on the RTX 2060). Cloudflare's free plan rejects uploads larger than **100 MB**,
  so upload audio (`.m4a`/`.mp3`) rather than large video files, or upload big files on the PC itself
  at http://localhost:5173.

A Cloudflare Tunnel needs the domain's DNS to be run by Cloudflare (free); the website's A record
then points at the shared host and `api.` at the tunnel.

### Step 1: put a domain on Cloudflare (once)

1. Create a free account at https://dash.cloudflare.com and **Add a site** with your new domain; pick the Free plan.
2. At the domain registrar, replace its nameservers with the two Cloudflare shows. Wait until Cloudflare says the site is **Active**.

### Step 2: connect your PC with a Cloudflare Tunnel (once)

In PowerShell:

```bash
winget install --id Cloudflare.cloudflared
```

Then, in a new PowerShell window (replace `your-domain.com`):

```bash
cloudflared tunnel login
```

```bash
cloudflared tunnel create meetcite
```

```bash
cloudflared tunnel route dns meetcite api.your-domain.com
```

Create `C:\Users\PC\.cloudflared\config.yml` (the `credentials-file` name is printed by `tunnel create`):

```yaml
tunnel: meetcite
credentials-file: C:\Users\PC\.cloudflared\<TUNNEL-ID>.json
ingress:
  - hostname: api.your-domain.com
    service: http://localhost:8000
  - service: http_status:404
```

Install it as a Windows service so it starts with the PC (run PowerShell **as administrator**):

```bash
cloudflared service install
```

### Step 3: tell the API about the website (once)

Add to `backend\.env`:

```
ENVIRONMENT=production
CORS_ORIGINS=["https://yourmeetcite.com"]
TRUSTED_PROXY_HEADER=CF-Connecting-IP
```

`TRUSTED_PROXY_HEADER` makes sign-in rate limiting count real visitors instead of the tunnel. It is
safe only because the API listens on `127.0.0.1` (uvicorn's default), so every request comes through
the tunnel. Restart MeetCite (`.\start-meetcite.ps1`) and check https://api.your-domain.com/api/health
shows `{"status":"ok"}`.

### Step 4: build the website package (every time the website changes)

From the `MeetCite` folder:

```bash
.\deploy\build-website.ps1 -ApiUrl https://api.your-domain.com
```

This builds the site with the API address baked in and creates `deploy\meetcite-website.zip`,
including an `.htaccess` file that routes every page to the app, forces HTTPS, adds security
headers and keeps any Node.js app on the same account (Passenger) out of this folder.

### Step 5: upload to HostAfrica

1. In the hosting panel, add `yourmeetcite.com` as the account's domain (or an add-on domain).
2. Issue a free Let's Encrypt SSL certificate for it.
3. **File Manager** → open the domain's `public_html` folder → upload `meetcite-website.zip` → **Extract** → delete the zip.
   Check that `index.html`, the `assets` folder and `.htaccess` are directly inside `public_html`.
4. Open https://yourmeetcite.com. Check: the landing page loads; **Sign In** works; opening
   https://yourmeetcite.com/login directly (not by clicking) also works.

To update later: rebuild (step 4), upload and extract over the old files.

### Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "Cannot reach the MeetCite server" on sign-in | PC off/asleep, MeetCite not started, or tunnel not running (`Get-Service cloudflared`). Check https://api.your-domain.com/api/health. |
| Browser console shows a CORS error | `CORS_ORIGINS` in `backend\.env` must match the website address exactly (https, no trailing slash). Restart the API. |
| `/login` or `/meetings/5` shows "Not Found" when opened directly | `.htaccess` is missing from the website folder (it is a hidden file; enable "show hidden files"). |
| Another app's page appears instead of MeetCite | A parent folder's Passenger rules are applying; make sure MeetCite's `.htaccess` is in the website folder. |
| Upload of a large video fails at 100 MB | Cloudflare free plan limit. Upload the audio only, or upload on the PC. |
| Processing stops when the PC sleeps | Windows Settings → Power → set sleep to "Never" while hosting. |

### Rolling back

Keep the previous `meetcite-website.zip`. To roll back the website, extract the old zip over the
folder. To roll back the API, restore the previous code and restart; the database is backed up
by copying `C:\MeetMindData` while MeetCite is stopped (see below).

### Backups

Everything MeetCite stores is in `C:\MeetMindData` (database, recordings, working files, models).
Stop MeetCite, then copy the folder to an external drive, for example:

```bash
robocopy C:\MeetMindData E:\MeetMindBackup /MIR /XD models
```

(`/XD models` skips the 4 GB of downloadable AI models.) To restore, copy it back and start MeetCite.
Recordings are personal data: keep backups encrypted (e.g. BitLocker To Go) and don't put them on
cloud-synced folders.

## Always-on option: a rented GPU server

If MeetCite must stay online without your PC, rent a Linux server **with an NVIDIA GPU** and run the
included Docker Compose stack (PostgreSQL, Redis, API, GPU worker, Ollama, website):

```bash
docker compose up -d --build
```

Examples (prices checked October 2026; confirm before ordering):

* **Hetzner GEX44** dedicated server (RTX 4000 SFF Ada, 20 GB): about €184/month plus a one-time setup fee.
  Runs the Compose file as it is.
* **RunPod** GPU pods are billed per hour (roughly $0.34-$0.69/hour for an RTX 4090), so you could run
  one only for the demonstration. Pods are themselves containers, so the Compose file would need
  adapting to a single image.

On such a server the website can be served by the stack itself, or kept on HostAfrica with
`-ApiUrl` pointing at the server. Data would then be held by that provider, which the privacy notice
and ethics approval must state.

## Configuration reference (`backend\.env`)

| Variable | Development | Production |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` |
| `SECRET_KEY` | any long random string | a different long random string (never committed) |
| `DATABASE_URL` | `sqlite:///C:/MeetMindData/meetmind.db` | same, or PostgreSQL in Docker |
| `DATA_DIR` | `C:/MeetMindData` | same (outside any cloud-synced folder) |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | `["https://yourmeetcite.com"]` |
| `TRUSTED_PROXY_HEADER` | empty | `CF-Connecting-IP` behind Cloudflare |
| `AUTH_ATTEMPTS_PER_MINUTE` | `10` | `10` |
| `MAX_UPLOAD_MB` | `1024` | `1024` (Cloudflare free plan still caps at 100 MB) |
| `HF_TOKEN` | optional | optional (enables speaker separation) |
| `CLOUD_LLM_ENABLED` | `false` | `false` |

The website has one build-time setting, `VITE_API_URL`, set by `deploy\build-website.ps1`. It holds
no secrets: never put API keys in the website.

# `tools/desktop-agent.js`

Minimal cross-platform Node.js desktop monitoring agent for REM.

## What it does

A single-file Node process that, while running, behaves like a
real desktop tracker (Hubstaff / Toggl / WorkComposer style):

1. **Logs in** (or uses a JWT you provide).
2. **Starts a work session** on the REM backend.
3. **Every 20s** — sends an activity heartbeat → resets the idle timer.
4. **Every 30s** — captures the **actual desktop screen** (not the browser
   tab) using `screenshot-desktop`, base64-encodes it as a data URI,
   and POSTs it to `/work-session/:sessionId/screenshots`.
5. **On Ctrl+C** — stops the session cleanly so totals are persisted.

Same HTTP contract a packaged Electron agent would use — the only thing
production would change is uploading the JPEG to Cloudinary/S3 first
and POSTing the URL instead of inlining a data URI.

## Run

Make sure the backend is running (`npm run dev`), then:

```powershell
# Option A — log in inline
npm run agent -- --email=qa@example.com --password=YourPass1!

# Option B — use a token you already have (e.g. from Postman)
npm run agent -- --token=eyJhbGc...

# Custom cadence (5s minimum on both)
npm run agent -- --email=x@y --password=z --interval=10 --heartbeat=15

# Heartbeat-only mode (idle-detection testing, no screen capture)
npm run agent -- --email=x@y --password=z --no-screenshots

# Show all options
npm run agent:help
```

## Env-var equivalents

| Flag | Env var |
|---|---|
| `--base-url` | `REM_BASE_URL` |
| `--token` | `REM_TOKEN` |
| `--email` | `REM_EMAIL` |
| `--password` | `REM_PASSWORD` |
| `--org` | `REM_ORG_ID` |
| `--task` | `REM_TASK_ID` |

Useful for shells/services where you don't want secrets in argv.

## Sample output

```
╭─ REM desktop agent ─────────────────────────────
│ base       : http://localhost:3000
│ cadence    : 30s screenshots / 20s heartbeat
│ screenshots: ENABLED
╰─────────────────────────────────────────────────
[13:45:01] [agent] login as qa@example.com
[13:45:02] [agent] logged in as qa-tester
[13:45:02] [agent] resolved orgId = 6a2fbf06… (REM Demo Org)
[13:45:03] [agent] session …a11b started
[13:45:03] [agent] running. press Ctrl+C to stop.
[13:45:04] [agent] 📸 #1  142KB  13:45:04  (failed: 0)
[13:45:34] [agent] 📸 #2  138KB  13:45:34  (failed: 0)
[13:46:04] [agent] 📸 #3  151KB  13:46:04  (failed: 0)
[13:46:04] [agent] stats: up 1.0min · screenshots 3/3 · heartbeats 3/3
^C
[agent] received SIGINT — shutting down gracefully…
[agent] session stopped
[agent] done. captured=3 failed=0 heartbeats=3
```

## Verifying it works

While the agent is running, in another terminal:

```powershell
# Confirm a session exists
curl http://localhost:3000/work-session/me -H "Authorization: Bearer <token>"
```

Or open the QA harness → tab **6. Monitoring** → section 1
**GET /me (my sessions)**. You should see one active session with
the agent's `note: "desktop-agent"` and incrementing `lastActivityAt`.

## Stop quietly

`Ctrl+C` once. The agent will:
1. Cancel both intervals.
2. `POST /work-session/stop` so the BE persists final totals.
3. Print a summary line and exit 0.

## Platform notes

`screenshot-desktop` uses native helpers under the hood:

| OS | Backend |
|---|---|
| Windows | bundled `screenCapture.bat` + `nircmd.exe` |
| macOS | built-in `screencapture` (no extra install) |
| Linux | `scrot` or `imagemagick` (`sudo apt install scrot`) |

If capture fails on Linux, install `scrot` first.

## Why data-URI instead of Cloudinary upload?

Two reasons:
1. Zero configuration on first run — works as soon as `npm install` finishes.
2. The backend validator accepts the `data:` URI scheme as a valid URL,
   so the endpoint shape is identical to what a Cloudinary URL would be.

For production:
- Pre-upload to Cloudinary (the project already has `cloudinary` configured).
- Replace the `dataUrl` assignment in `captureAndUpload()` with the
  `secure_url` returned by `cloudinary.uploader.upload_stream()`.
- That's a ~10-line swap; the rest of the agent stays the same.

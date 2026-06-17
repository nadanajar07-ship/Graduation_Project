#!/usr/bin/env node
/**
 * tools/desktop-agent.js
 *
 * Minimal cross-platform desktop monitoring agent for REM.
 *
 * What it does (per running instance):
 *   1. Logs in (or uses a provided JWT)
 *   2. Resolves orgId (first org of the user, or one you pass)
 *   3. Starts a work session
 *   4. Sends an activity heartbeat every N seconds → keeps idle timer reset
 *   5. Captures the REAL desktop every M seconds → uploads as data-URI to
 *      POST /work-session/:sessionId/screenshots
 *   6. On Ctrl+C → stops the session cleanly
 *
 * Usage examples:
 *
 *   # auto-login + auto-resolve org + run with defaults (30s screenshots, 20s heartbeat)
 *   node tools/desktop-agent.js --email=qa@example.com --password=YourPass1!
 *
 *   # use an existing token (no login round-trip)
 *   node tools/desktop-agent.js --token=eyJhbGc... --org=6a2f...
 *
 *   # heartbeat-only mode (no screen capture, useful for idle-detection tests)
 *   node tools/desktop-agent.js --email=x@y --password=z --no-screenshots
 *
 *   # different cadence
 *   node tools/desktop-agent.js --email=x@y --password=z --interval=10 --heartbeat=15
 *
 * Env-var equivalents:
 *   REM_BASE_URL  REM_TOKEN  REM_EMAIL  REM_PASSWORD  REM_ORG_ID  REM_TASK_ID
 *
 * Production note:
 *   This agent is the same contract a packaged Electron app would use.
 *   Replace `screenshot-desktop` with native APIs + Cloudinary direct
 *   upload (instead of inline data-URI) for production deployments.
 */

import screenshot from "screenshot-desktop";

// ── Args ──────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const config = {
  baseUrl:
    args["base-url"] || process.env.REM_BASE_URL || "http://localhost:3000",
  accessToken: args.token || process.env.REM_TOKEN,
  email: args.email || process.env.REM_EMAIL,
  password: args.password || process.env.REM_PASSWORD,
  orgId: args.org || process.env.REM_ORG_ID,
  taskId: args.task || process.env.REM_TASK_ID,
  intervalSec: Math.max(5, Number(args.interval) || 30),
  heartbeatSec: Math.max(5, Number(args.heartbeat) || 20),
  noScreenshots: args["no-screenshots"] === true,
  jpegQuality: Math.min(95, Math.max(20, Number(args.quality) || 60)),
};

if (!config.accessToken && !(config.email && config.password)) {
  console.error(
    "ERROR: need either --token=<jwt> OR both --email=<x> --password=<y>",
  );
  console.error("       run with --help to see all options");
  process.exit(2);
}

// ── State ─────────────────────────────────────────────────────────
const state = {
  sessionId: null,
  capturedCount: 0,
  failedCaptures: 0,
  heartbeatCount: 0,
  failedHeartbeats: 0,
  startedAt: null,
  shuttingDown: false,
};

// ── HTTP helper ───────────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = config.baseUrl.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(config.accessToken && {
        Authorization: "Bearer " + config.accessToken,
      }),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = (body && body.message) || res.statusText;
    throw new Error(`HTTP ${res.status} ${path} — ${msg}`);
  }
  return body;
}

// ── Lifecycle ─────────────────────────────────────────────────────
async function login() {
  if (config.accessToken) return;
  log(`login as ${config.email}`);
  const r = await api("/auth/login", {
    method: "POST",
    body: { email: config.email, password: config.password },
  });
  if (r.data?.requiresOTP) {
    console.error(
      "ERROR: account has 2FA enabled — use --token=<jwt> instead.",
    );
    process.exit(3);
  }
  config.accessToken = r.data.accessToken;
  log(`logged in as ${r.data.user.username}`);
}

async function resolveOrg() {
  if (config.orgId) return;
  const r = await api("/org/me");
  // Response shape: { data: { organizations: [...] } } (or sometimes the array directly)
  const orgs = r.data?.organizations || r.data || [];
  if (!Array.isArray(orgs) || orgs.length === 0) {
    console.error("ERROR: this user has no orgs — create one first.");
    process.exit(4);
  }
  const first = orgs[0];
  config.orgId = first._id || first.organizationId?._id;
  log(`resolved orgId = ${config.orgId} (${first.name || "(no name)"})`);
}

async function startSession() {
  log("starting work session");
  try {
    const r = await api("/work-session/start", {
      method: "POST",
      body: {
        orgId: config.orgId,
        taskId: config.taskId,
        note: "desktop-agent",
      },
    });
    state.sessionId = r.data._id || r.data.sessionId;
    state.startedAt = new Date();
    log(`session ${shortId(state.sessionId)} started`);
  } catch (err) {
    // Already have an active session? Reuse it via /me.
    if (/409|already.*active/i.test(err.message)) {
      log("an active session already exists — fetching it");
      const me = await api(`/work-session/me?orgId=${config.orgId}`);
      const items = me.data?.items || me.data || [];
      const live = items.find((s) =>
        ["active", "paused"].includes(s.status),
      );
      if (live) {
        state.sessionId = live._id;
        log(`reusing session ${shortId(state.sessionId)}`);
        return;
      }
    }
    throw err;
  }
}

async function stopSession() {
  if (!state.sessionId) return;
  try {
    await api("/work-session/stop", {
      method: "POST",
      body: { orgId: config.orgId, note: "agent shutdown" },
    });
    log("session stopped");
  } catch (err) {
    console.error("[agent] stop failed:", err.message);
  }
}

// ── Heartbeat loop ────────────────────────────────────────────────
async function sendHeartbeat() {
  try {
    await api("/work-session/activity", {
      method: "POST",
      body: { orgId: config.orgId, type: "mouse" },
    });
    state.heartbeatCount++;
  } catch (err) {
    state.failedHeartbeats++;
    // Quiet by default — only log when it gets concerning
    if (state.failedHeartbeats % 5 === 0) {
      console.error(
        `[agent] heartbeat failing (${state.failedHeartbeats} in a row): ${err.message}`,
      );
    }
  }
}

// ── Capture loop ──────────────────────────────────────────────────
async function captureAndUpload() {
  if (!state.sessionId) return;
  try {
    const buf = await screenshot({ format: "jpg" });
    const dataUrl = "data:image/jpeg;base64," + buf.toString("base64");
    const at = new Date();
    await api(`/work-session/${state.sessionId}/screenshots`, {
      method: "POST",
      body: { imageUrl: dataUrl, capturedAt: at.toISOString() },
    });
    state.capturedCount++;
    const kb = Math.round(buf.length / 1024);
    log(
      `📸 #${state.capturedCount}  ${kb}KB  ${at.toLocaleTimeString()}  (failed: ${state.failedCaptures})`,
    );
  } catch (err) {
    state.failedCaptures++;
    console.error(
      `[agent] capture failed (#${state.failedCaptures}):`,
      err.message,
    );
  }
}

// ── Shutdown ──────────────────────────────────────────────────────
function setupShutdown() {
  const handler = async (sig) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    console.log(`\n[agent] received ${sig} — shutting down gracefully…`);
    await stopSession();
    log(
      `done. captured=${state.capturedCount} failed=${state.failedCaptures} heartbeats=${state.heartbeatCount}`,
    );
    process.exit(0);
  };
  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));

  // Print stats on demand: send SIGUSR1 (unix) or just every 60s
  setInterval(() => {
    if (state.shuttingDown) return;
    const upMin = (
      (Date.now() - state.startedAt.getTime()) /
      60000
    ).toFixed(1);
    log(
      `stats: up ${upMin}min · screenshots ${state.capturedCount}/${state.capturedCount + state.failedCaptures} · heartbeats ${state.heartbeatCount}/${state.heartbeatCount + state.failedHeartbeats}`,
    );
  }, 60 * 1000).unref();
}

// ── Utilities ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(=(.*))?$/);
    if (m) out[m[1]] = m[3] === undefined ? true : m[3];
  }
  return out;
}

function log(msg) {
  const t = new Date().toLocaleTimeString();
  console.log(`[${t}] [agent] ${msg}`);
}

function shortId(id) {
  const s = String(id);
  return s.length > 6 ? "…" + s.slice(-6) : s;
}

function printHelp() {
  console.log(`
REM desktop monitoring agent

Usage:
  node tools/desktop-agent.js [options]

Required (one of):
  --email=<x>       --password=<y>     Login first then run
  --token=<jwt>                        Use an existing access token

Optional:
  --base-url=<url>      Default: http://localhost:3000
  --org=<orgId>         Default: user's first org
  --task=<taskId>       Attach session to a specific task
  --interval=<sec>      Screenshot cadence (min 5, default 30)
  --heartbeat=<sec>     Activity heartbeat (min 5, default 20)
  --quality=<20..95>    JPEG quality (default 60 — note: not all libs honor this)
  --no-screenshots      Heartbeat only, no captures
  --help                Show this help

Env vars:
  REM_BASE_URL  REM_TOKEN  REM_EMAIL  REM_PASSWORD  REM_ORG_ID  REM_TASK_ID

Stop with Ctrl+C — the agent will close the session cleanly before exiting.
`);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("╭─ REM desktop agent ─────────────────────────────");
  console.log(`│ base       : ${config.baseUrl}`);
  console.log(
    `│ cadence    : ${config.intervalSec}s screenshots / ${config.heartbeatSec}s heartbeat`,
  );
  console.log(
    `│ screenshots: ${config.noScreenshots ? "DISABLED (heartbeat-only)" : "ENABLED"}`,
  );
  console.log("╰─────────────────────────────────────────────────");

  setupShutdown();

  try {
    await login();
    await resolveOrg();
    await startSession();
  } catch (err) {
    console.error("[agent] startup failed:", err.message);
    process.exit(1);
  }

  // Heartbeat
  setInterval(sendHeartbeat, config.heartbeatSec * 1000).unref();

  // Screenshots
  if (!config.noScreenshots) {
    // Take one immediately so the user gets fast feedback
    captureAndUpload();
    setInterval(captureAndUpload, config.intervalSec * 1000).unref();
  }

  log("running. press Ctrl+C to stop.");

  // Keep the process alive forever (timers are .unref()'d, so this is needed)
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});

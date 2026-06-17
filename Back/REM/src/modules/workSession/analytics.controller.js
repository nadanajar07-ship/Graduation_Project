/**
 * modules/workSession/analytics.controller.js
 *
 * ── STATIC AI WORKFORCE ANALYTICS ───────────────────────────────
 * Computes productivity analytics ENTIRELY from locally-stored
 * monitoring data — no OpenAI, no external service.
 *
 * Data sources (all already collected by the desktop agent):
 *   • workSession  → activeSeconds / idleSeconds / pausedSeconds
 *   • activityEvent → app_usage / website_visit (app-level breakdown)
 *   • screenshot    → capture counts per session
 *
 * Productivity classification is done with a deterministic, local
 * keyword dictionary (classifyApp). When app-level telemetry has not
 * been uploaded yet, the engine still returns real timing-based
 * productivity (active vs idle) and flags `hasAppTelemetry: false`
 * instead of inventing numbers.
 *
 * Mounted under /work-session  (admin/owner only).
 */

import { Router } from "express";
import workSessionModel from "../../DB/Model/worksession.model.js";
import activityEventModel from "../../DB/Model/activityEvent.model.js";
import screenshotModel from "../../DB/Model/screenshot.model.js";
import memberModel, { memberRoles } from "../../DB/Model/member.model.js";
import { authentication } from "../../middleware/auth.middleware.js";
import { asyncHandler } from "../../utils/response/error.response.js";
import { successResponse } from "../../utils/response/success.response.js";
import { httpError } from "../../utils/errors/index.js";
import { requireOrgAdmin } from "../../utils/permissions/org.permissions.js";

const router = Router();
router.use(authentication());

// ─────────────────────────────────────────────────────────────
// LOCAL PRODUCTIVITY CLASSIFIER  (no AI / no network)
// ─────────────────────────────────────────────────────────────
// A static dictionary that maps an application / website name to a
// productivity category. Matching is case-insensitive substring.
// Anything not matched falls back to "neutral".
const PRODUCTIVE_APPS = [
  "vs code", "visual studio", "intellij", "webstorm", "pycharm", "phpstorm",
  "android studio", "xcode", "terminal", "iterm", "powershell", "cmd",
  "github", "gitlab", "bitbucket", "jira", "confluence", "linear", "notion",
  "figma", "sketch", "postman", "insomnia", "docker", "kubernetes",
  "slack", "microsoft teams", "teams", "zoom", "outlook", "gmail", "mail",
  "word", "excel", "powerpoint", "google docs", "google sheets", "docs",
  "sheets", "stack overflow", "stackoverflow", "mdn", "developer", "console",
];
const DISTRACTING_APPS = [
  "youtube", "facebook", "instagram", "tiktok", "twitter", "x.com",
  "reddit", "netflix", "twitch", "hulu", "disney", "primevideo",
  "steam", "epic games", "discord", "spotify", "soundcloud",
  "whatsapp", "telegram", "snapchat", "pinterest", "9gag", "imgur",
  "amazon", "ebay", "aliexpress", "game", "casino", "betting",
];

export function classifyApp(rawName = "") {
  const name = String(rawName).toLowerCase();
  if (!name) return "neutral";
  if (DISTRACTING_APPS.some((k) => name.includes(k))) return "distracting";
  if (PRODUCTIVE_APPS.some((k) => name.includes(k))) return "productive";
  return "neutral";
}

// Duration (seconds) an activity event represents.
function eventSeconds(e) {
  if (e.startTime && e.endTime) {
    const s = Math.floor((new Date(e.endTime) - new Date(e.startTime)) / 1000);
    return s > 0 ? s : 0;
  }
  // app_usage / website_visit without an explicit window → assume one
  // minute-bucket (the agent's default upload cadence).
  return 60;
}

function appName(e) {
  return (
    e.payload?.appName ||
    e.payload?.domain ||
    e.payload?.windowTitle ||
    "Unknown"
  );
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Build a 4-way productivity breakdown that always sums to ~100%.
 *
 * idle%   comes straight from session timing (real).
 * active% is split into productive / distracting / neutral using the
 * app-second proportions when telemetry exists; otherwise the whole
 * active block is reported as "productive" (best-effort from timing)
 * and distracting / neutral stay 0 — we never invent a split.
 */
function buildBreakdown(activeSeconds, idleSeconds, appBuckets) {
  const base = activeSeconds + idleSeconds;
  if (base <= 0) {
    return { productivePct: 0, distractingPct: 0, idlePct: 0, neutralPct: 0 };
  }
  const idlePct = (idleSeconds / base) * 100;
  const activePct = (activeSeconds / base) * 100;

  const appTotal =
    appBuckets.productive + appBuckets.distracting + appBuckets.neutral;

  let productivePct, distractingPct, neutralPct;
  if (appTotal > 0) {
    productivePct = activePct * (appBuckets.productive / appTotal);
    distractingPct = activePct * (appBuckets.distracting / appTotal);
    neutralPct = activePct * (appBuckets.neutral / appTotal);
  } else {
    // No app telemetry — active time is genuinely productive working
    // time we just can't categorise by app yet.
    productivePct = activePct;
    distractingPct = 0;
    neutralPct = 0;
  }

  return {
    productivePct: round1(productivePct),
    distractingPct: round1(distractingPct),
    idlePct: round1(idlePct),
    neutralPct: round1(neutralPct),
  };
}

// ─────────────────────────────────────────────────────────────
// GET /work-session/analytics/workforce?orgId=&from=&to=
// Org owner/admin only. Returns the full AI-analytics payload.
// ─────────────────────────────────────────────────────────────
router.get(
  "/analytics/workforce",
  asyncHandler(async (req, res) => {
    const { orgId, from, to } = req.query;
    if (!orgId) throw httpError(400, "orgId is required");

    await requireOrgAdmin(orgId, req.user._id);

    // ── Time range (defaults to all-time) ──────────────────────
    const sessionFilter = { organizationId: orgId };
    if (from || to) {
      sessionFilter.startTime = {};
      if (from) sessionFilter.startTime.$gte = new Date(from);
      if (to) sessionFilter.startTime.$lte = new Date(to);
    }

    // ── Members (the roster — drives names + who appears) ──────
    const members = await memberModel
      .find({ organizationId: orgId, isActive: true })
      .populate("userId", "username email image fullName")
      .lean();

    // ── Work sessions in range ─────────────────────────────────
    const sessions = await workSessionModel
      .find(sessionFilter)
      .select("userId activeSeconds idleSeconds pausedSeconds")
      .lean();

    const sessionIds = sessions.map((s) => s._id);

    // ── App telemetry (may be empty) ───────────────────────────
    const eventFilter = { organizationId: orgId };
    if (from || to) {
      eventFilter.bucketAt = {};
      if (from) eventFilter.bucketAt.$gte = new Date(from);
      if (to) eventFilter.bucketAt.$lte = new Date(to);
    }
    const events = await activityEventModel
      .find({ ...eventFilter, type: { $in: ["app_usage", "website_visit"] } })
      .select("userId type payload startTime endTime")
      .lean();

    // ── Screenshot counts per user (via their sessions) ────────
    let screenshotByUser = {};
    if (sessionIds.length) {
      const shotAgg = await screenshotModel.aggregate([
        { $match: { session: { $in: sessionIds } } },
        { $group: { _id: "$session", n: { $sum: 1 } } },
      ]);
      const sessionToUser = {};
      for (const s of sessions) sessionToUser[String(s._id)] = String(s.userId);
      for (const row of shotAgg) {
        const uid = sessionToUser[String(row._id)];
        if (uid) screenshotByUser[uid] = (screenshotByUser[uid] || 0) + row.n;
      }
    }

    // ── Per-user accumulators ──────────────────────────────────
    const acc = {}; // userId → { active, idle, paused, sessions, apps:{name→{sec,cat}} }
    const ensure = (uid) => {
      if (!acc[uid]) {
        acc[uid] = {
          active: 0,
          idle: 0,
          paused: 0,
          sessions: 0,
          apps: {},
        };
      }
      return acc[uid];
    };

    for (const s of sessions) {
      const a = ensure(String(s.userId));
      a.active += s.activeSeconds || 0;
      a.idle += s.idleSeconds || 0;
      a.paused += s.pausedSeconds || 0;
      a.sessions += 1;
    }

    const hasAppTelemetry = events.length > 0;
    for (const e of events) {
      const a = ensure(String(e.userId));
      const name = appName(e);
      const secs = eventSeconds(e);
      // website_visit may carry an explicit productive flag — honour it.
      let cat;
      if (e.type === "website_visit" && typeof e.payload?.productive === "boolean") {
        cat = e.payload.productive ? "productive" : "distracting";
      } else {
        cat = classifyApp(name);
      }
      if (!a.apps[name]) a.apps[name] = { seconds: 0, category: cat };
      a.apps[name].seconds += secs;
    }

    // ── Build per-employee rows ────────────────────────────────
    const orgApps = {}; // name → { seconds, category }
    const employees = [];

    for (const m of members) {
      const u = m.userId;
      if (!u) continue;
      const uid = String(u._id);
      const a = acc[uid] || { active: 0, idle: 0, paused: 0, sessions: 0, apps: {} };

      // App buckets for this employee
      const buckets = { productive: 0, distracting: 0, neutral: 0 };
      const topApplications = [];
      for (const [name, info] of Object.entries(a.apps)) {
        buckets[info.category] += info.seconds;
        topApplications.push({ name, seconds: info.seconds, category: info.category });
        // roll into org-wide
        if (!orgApps[name]) orgApps[name] = { seconds: 0, category: info.category };
        orgApps[name].seconds += info.seconds;
      }
      topApplications.sort((x, y) => y.seconds - x.seconds);

      const breakdown = buildBreakdown(a.active, a.idle, buckets);
      const trackedSeconds = a.active + a.idle + a.paused;

      employees.push({
        userId: uid,
        name: u.fullName || u.username || u.email?.split("@")[0] || "Unknown",
        email: u.email || "",
        image: u.image || null,
        role: m.role,
        activeSeconds: a.active,
        idleSeconds: a.idle,
        pausedSeconds: a.paused,
        trackedSeconds,
        sessions: a.sessions,
        screenshots: screenshotByUser[uid] || 0,
        breakdown,
        // Productivity score = productive share of tracked active+idle time.
        productivityScore: breakdown.productivePct,
        topApplications: topApplications.slice(0, 5),
        hasData: trackedSeconds > 0,
      });
    }

    // ── Team-level aggregates ──────────────────────────────────
    const tracked = employees.filter((e) => e.hasData);
    const totalActive = employees.reduce((s, e) => s + e.activeSeconds, 0);
    const totalIdle = employees.reduce((s, e) => s + e.idleSeconds, 0);
    const totalPaused = employees.reduce((s, e) => s + e.pausedSeconds, 0);

    const teamBuckets = { productive: 0, distracting: 0, neutral: 0 };
    for (const [, info] of Object.entries(orgApps)) {
      teamBuckets[info.category] += info.seconds;
    }
    const teamBreakdown = buildBreakdown(totalActive, totalIdle, teamBuckets);

    const averageTeamProductivity = tracked.length
      ? round1(
          tracked.reduce((s, e) => s + e.productivityScore, 0) / tracked.length,
        )
      : 0;

    // ── Insights cards ─────────────────────────────────────────
    const sortedByScore = [...tracked].sort(
      (a, b) => b.productivityScore - a.productivityScore,
    );
    const topPerformer = sortedByScore[0] || null;
    const needsAttention =
      sortedByScore.length > 1
        ? sortedByScore[sortedByScore.length - 1]
        : null;

    const orgAppList = Object.entries(orgApps)
      .map(([name, info]) => ({ name, seconds: info.seconds, category: info.category }))
      .sort((a, b) => b.seconds - a.seconds);
    const mostUsedApplication = orgAppList[0] || null;

    return successResponse({
      res,
      data: {
        range: { from: from || null, to: to || null },
        team: {
          employeeCount: employees.length,
          trackedEmployeeCount: tracked.length,
          totalActiveSeconds: totalActive,
          totalIdleSeconds: totalIdle,
          totalPausedSeconds: totalPaused,
          totalTrackedSeconds: totalActive + totalIdle + totalPaused,
          breakdown: teamBreakdown,
          averageProductivity: averageTeamProductivity,
        },
        employees,
        topApplications: orgAppList.slice(0, 10),
        insights: {
          topPerformer: topPerformer
            ? {
                userId: topPerformer.userId,
                name: topPerformer.name,
                image: topPerformer.image,
                productivityScore: topPerformer.productivityScore,
              }
            : null,
          needsAttention: needsAttention
            ? {
                userId: needsAttention.userId,
                name: needsAttention.name,
                image: needsAttention.image,
                productivityScore: needsAttention.productivityScore,
              }
            : null,
          averageTeamProductivity,
          mostUsedApplication,
        },
        meta: {
          hasAppTelemetry,
          generatedAt: new Date(),
          dataPoints: {
            sessions: sessions.length,
            activityEvents: events.length,
            members: members.length,
          },
        },
      },
    });
  }),
);

export default router;

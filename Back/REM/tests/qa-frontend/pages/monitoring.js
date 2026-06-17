/**
 * Monitoring page — work sessions, screenshots, activity events, idle.
 *
 * Two flows tested here:
 *
 * 1. Work session lifecycle:
 *    start → activity heartbeat → (idle after 60s no heartbeat) → resume → stop
 *
 * 2. Agent uploads:
 *    screenshot upload (uses Cloudinary URL — the desktop agent
 *    pre-uploads, this endpoint only stores the URL)
 *    activity events batch (keystroke/mouse/app_usage/website_visit)
 *
 * Idle detection runs server-side on a 30s tick with a 60s threshold.
 * To test it: start a session, send one activity heartbeat, wait ~90s,
 * then GET /work-session/me — you should see `isIdle: true` on the
 * active session.
 */

import { api } from "../api/client.js";
import {
  card,
  row,
  input,
  button,
  el,
  runWithPanel,
} from "../components/ui.js";

const featureRow = (title, rowKids, panel) =>
  card(title, el("div", {}, [row(...rowKids), panel]));

let idleWatchTimer = null;

/**
 * Try to auto-populate orgId from the user's first org.
 *
 * The BE genuinely requires orgId because a user can belong to many
 * orgs (multi-tenant) — work-session time has to be scoped to ONE.
 * We just save you typing by reading `GET /org/me` once and caching
 * the first org id in localStorage.
 */
async function loadDefaultOrgId() {
  // Cache hit
  const cached = localStorage.getItem("rem.qa.orgId");
  if (cached) return cached;

  try {
    const r = await api("/org/me");
    // Response shape: { data: { organizations: [{ _id, name, memberRole, ... }] } }
    const orgs = r?.body?.data?.organizations || r?.body?.data || [];
    const first = Array.isArray(orgs) && orgs[0];
    const orgId = first?._id || first?.organizationId?._id;
    if (orgId) {
      localStorage.setItem("rem.qa.orgId", orgId);
      return orgId;
    }
  } catch {
    /* not logged in or no orgs — leave blank, user can paste manually */
  }
  return "";
}

function setAll(ids, value) {
  if (!value) return;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = value;
  }
}

export async function render(host) {
  // Top banner showing the current default org + a "switch org" link.
  const orgBanner = el(
    "div",
    {
      class:
        "bg-blue-50 border border-blue-200 rounded p-2 mb-3 text-sm flex items-center gap-2",
    },
    [
      el("span", {}, "Default orgId (auto-filled below): "),
      el(
        "code",
        { id: "currentOrgChip", class: "bg-white px-2 py-0.5 rounded border" },
        "loading…",
      ),
      el(
        "button",
        {
          class: "ml-auto text-xs text-blue-700 underline",
          onclick: async () => {
            localStorage.removeItem("rem.qa.orgId");
            const r = await api("/org/me");
            const orgs =
              r?.body?.data?.organizations || r?.body?.data || [];
            if (!Array.isArray(orgs) || orgs.length === 0) {
              alert("No orgs found for your account. Create one first.");
              return;
            }
            const list = orgs
              .map(
                (o, i) =>
                  `${i + 1}. ${o.name || "(no name)"}  —  ${o._id || o.organizationId?._id}`,
              )
              .join("\n");
            const pick = prompt(
              `Pick org (1..${orgs.length}):\n\n${list}`,
              "1",
            );
            const idx = Number(pick) - 1;
            const chosen = orgs[idx];
            if (chosen) {
              const id = chosen._id || chosen.organizationId?._id;
              localStorage.setItem("rem.qa.orgId", id);
              location.reload();
            }
          },
        },
        "switch org",
      ),
    ],
  );
  host.appendChild(orgBanner);

  const defaultOrgId = await loadDefaultOrgId();
  document.getElementById("currentOrgChip").textContent =
    defaultOrgId || "(not set — type one manually)";

  // ── 1. Work session lifecycle ────────────────────────────
  const out1 = el("div", { class: "border rounded p-2 min-h-[60px] mt-2" });
  host.appendChild(
    featureRow(
      "1. Work session lifecycle (start → pause → resume → stop)",
      [
        input("wsOrg", "orgId", defaultOrgId),
        input("wsTask", "taskId (optional)"),
        input("wsNote", "note (optional)"),
        button("▶ Start", async () => {
          const payload = {
            orgId: document.getElementById("wsOrg").value.trim(),
            taskId: document.getElementById("wsTask").value.trim() || undefined,
            note: document.getElementById("wsNote").value || undefined,
          };
          const res = await runWithPanel(
            out1,
            { method: "POST", url: "/work-session/start", payload },
            () => api("/work-session/start", { method: "POST", body: payload }),
          );
          // Auto-save sessionId so the screenshot + activity panels can use it.
          const sid = res?.body?.data?._id || res?.body?.data?.sessionId;
          if (sid) {
            ["screenSid", "actSid"].forEach((id) => {
              const el = document.getElementById(id);
              if (el) el.value = sid;
            });
          }
        }, "success"),
        button("⏸ Pause", async () => {
          const payload = {
            orgId: document.getElementById("wsOrg").value.trim(),
            note: document.getElementById("wsNote").value || undefined,
          };
          await runWithPanel(
            out1,
            { method: "POST", url: "/work-session/pause", payload },
            () => api("/work-session/pause", { method: "POST", body: payload }),
          );
        }, "ghost"),
        button("▶ Resume", async () => {
          const payload = {
            orgId: document.getElementById("wsOrg").value.trim(),
          };
          await runWithPanel(
            out1,
            { method: "POST", url: "/work-session/resume", payload },
            () =>
              api("/work-session/resume", { method: "POST", body: payload }),
          );
        }, "ghost"),
        button("⏹ Stop", async () => {
          const payload = {
            orgId: document.getElementById("wsOrg").value.trim(),
            note: document.getElementById("wsNote").value || undefined,
          };
          await runWithPanel(
            out1,
            { method: "POST", url: "/work-session/stop", payload },
            () => api("/work-session/stop", { method: "POST", body: payload }),
          );
        }, "danger"),
        button("GET /me (my sessions)", async () =>
          runWithPanel(out1, { method: "GET", url: "/work-session/me" }, () =>
            api("/work-session/me"),
          ),
        ),
      ],
      out1,
    ),
  );

  // ── 2. Activity heartbeat (drives idle detection) ────────
  const out2 = el("div", { class: "border rounded p-2 min-h-[60px] mt-2" });
  host.appendChild(
    featureRow(
      "2. Activity heartbeat (resets the idle timer)",
      [
        input("hbOrg", "orgId (same as session)", defaultOrgId),
        input("hbType", "type (e.g. mouse, keystroke)", "mouse"),
        input("hbDetails", "details (optional JSON)"),
        button("Send heartbeat", async () => {
          let details;
          try {
            details = document.getElementById("hbDetails").value
              ? JSON.parse(document.getElementById("hbDetails").value)
              : undefined;
          } catch {
            details = undefined;
          }
          const payload = {
            orgId: document.getElementById("hbOrg").value.trim(),
            type: document.getElementById("hbType").value || "mouse",
            details,
          };
          await runWithPanel(
            out2,
            { method: "POST", url: "/work-session/activity", payload },
            () =>
              api("/work-session/activity", { method: "POST", body: payload }),
          );
        }, "success"),
        button("Auto-heartbeat every 20s", async (ev) => {
          if (idleWatchTimer) {
            clearInterval(idleWatchTimer);
            idleWatchTimer = null;
            ev.target.textContent = "Auto-heartbeat every 20s";
            return;
          }
          const orgId = document.getElementById("hbOrg").value.trim();
          ev.target.textContent = "⏹ Stop auto-heartbeat";
          idleWatchTimer = setInterval(async () => {
            try {
              await api("/work-session/activity", {
                method: "POST",
                body: { orgId, type: "mouse" },
              });
              const t = new Date().toLocaleTimeString();
              out2.insertBefore(
                el(
                  "div",
                  { class: "text-xs text-emerald-700" },
                  `[${t}] heartbeat sent`,
                ),
                out2.firstChild,
              );
            } catch (err) {
              out2.insertBefore(
                el(
                  "div",
                  { class: "text-xs text-rose-700" },
                  `[err] ${err.message}`,
                ),
                out2.firstChild,
              );
            }
          }, 20_000);
        }, "ghost"),
      ],
      out2,
    ),
  );

  // ── 3. Idle detection watch ──────────────────────────────
  const out3 = el("div", { class: "border rounded p-2 min-h-[60px] mt-2" });
  host.appendChild(
    featureRow(
      "3. Idle detection watch — verify after ~90s of NO heartbeat",
      [
        el(
          "div",
          { class: "text-sm text-slate-600 flex-1" },
          [
            "Server detects idle when ",
            el("code", { class: "bg-slate-100 px-1" }, "lastActivityAt"),
            " is older than 60s. The cron tick runs every 30s, so ",
            el("strong", {}, "wait 90s after your last heartbeat"),
            ", then click ↓ — the active session should report ",
            el("code", { class: "bg-slate-100 px-1" }, "isIdle: true"),
            ".",
          ],
        ),
        button("Check idle status (GET /me)", async () =>
          runWithPanel(out3, { method: "GET", url: "/work-session/me" }, () =>
            api("/work-session/me"),
          ),
        ),
      ],
      out3,
    ),
  );

  // ── 4. Screenshots — REAL screen-capture (acts like a desktop agent) ─
  //
  // We hold ONE long-lived MediaStream across the whole session so the
  // browser only prompts the user once. A setInterval grabs a frame at
  // the configured cadence, converts it to a JPEG data-URI, and POSTs
  // it to /screenshots — the exact endpoint a real desktop agent would
  // hit. Stop button releases the stream and clears the timer.
  const out4 = el("div", { class: "border rounded p-2 min-h-[60px] mt-2" });

  // Module-scoped capture state (survives re-renders of inputs only)
  const capture = {
    stream: null,
    track: null,
    video: null,
    timer: null,
    sent: 0,
    failed: 0,
  };

  async function grabOneFrame() {
    if (!capture.stream) throw new Error("No active capture stream");

    // Use a hidden <video> element; ImageCapture.grabFrame() is unreliable
    // in some Chrome versions when the tab is backgrounded.
    if (!capture.video) {
      capture.video = document.createElement("video");
      capture.video.srcObject = capture.stream;
      capture.video.muted = true;
      await capture.video.play();
      // Give the first frame a moment to actually arrive
      await new Promise((r) => setTimeout(r, 200));
    }

    const canvas = document.createElement("canvas");
    canvas.width = capture.video.videoWidth || 1280;
    canvas.height = capture.video.videoHeight || 720;
    canvas.getContext("2d").drawImage(capture.video, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.6),
    );
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
    return { dataUrl, sizeKb: Math.round(blob.size / 1024) };
  }

  function stopAutoCapture() {
    if (capture.timer) {
      clearInterval(capture.timer);
      capture.timer = null;
    }
    if (capture.stream) {
      capture.stream.getTracks().forEach((t) => t.stop());
      capture.stream = null;
      capture.track = null;
      capture.video = null;
    }
    const btn = document.getElementById("autoCapBtn");
    if (btn) btn.textContent = "🎬 Start auto-capture";
    const status = document.getElementById("capStatus");
    if (status) status.textContent = "stopped";
  }

  async function startAutoCapture() {
    const sid = document.getElementById("screenSid").value.trim();
    if (!sid) {
      alert("Start a work session first so we have a sessionId.");
      return;
    }
    const intervalSec = Math.max(
      5,
      Number(document.getElementById("capInterval").value) || 30,
    );

    // Request screen permission ONCE — keeps the stream alive across captures
    capture.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 }, // we only need ~1fps for periodic snaps
      audio: false,
    });
    capture.track = capture.stream.getVideoTracks()[0];

    // If user clicks the browser's native "Stop sharing" → our cleanup
    capture.track.addEventListener("ended", stopAutoCapture);

    const btn = document.getElementById("autoCapBtn");
    btn.textContent = "⏹ Stop auto-capture";
    document.getElementById("capStatus").textContent = "running";

    const tick = async () => {
      try {
        const { dataUrl, sizeKb } = await grabOneFrame();
        const at = new Date();
        const res = await api(`/work-session/${sid}/screenshots`, {
          method: "POST",
          body: { imageUrl: dataUrl, capturedAt: at.toISOString() },
        });
        capture.sent++;
        const ok = res?.ok !== false && res?.status < 400;
        if (!ok) capture.failed++;
        // Compact log row with thumbnail
        const thumb = el("img", {
          src: dataUrl,
          class: "w-24 h-14 object-cover border rounded inline-block",
        });
        const line = el(
          "div",
          {
            class: `flex items-center gap-2 text-xs ${ok ? "text-emerald-700" : "text-rose-700"} mb-1`,
          },
          [
            thumb,
            el(
              "span",
              {},
              `${at.toLocaleTimeString()} · ${sizeKb}KB · ${res?.status || "?"} · sent ${capture.sent} (fail ${capture.failed})`,
            ),
          ],
        );
        out4.prepend(line);
        // Cap visible log so the page doesn't grow unbounded
        while (out4.children.length > 30) out4.removeChild(out4.lastChild);
      } catch (err) {
        capture.failed++;
        out4.prepend(
          el(
            "div",
            { class: "text-xs text-rose-700 mb-1" },
            `[${new Date().toLocaleTimeString()}] capture failed: ${err.message}`,
          ),
        );
      }
    };

    // Fire one immediately so user sees feedback fast, then on interval
    tick();
    capture.timer = setInterval(tick, intervalSec * 1000);
  }

  host.appendChild(
    featureRow(
      "4. Screenshots (URL-based — desktop agent uploads to Cloudinary first)",
      [
        input("screenSid", "sessionId"),
        input(
          "screenUrl",
          "imageUrl (e.g. https://res.cloudinary.com/...)",
          "",
          { class: "flex-[2]" },
        ),
        button("Upload (POST URL)", async () => {
          const sid = document.getElementById("screenSid").value.trim();
          const payload = {
            imageUrl:
              document.getElementById("screenUrl").value.trim() ||
              "https://via.placeholder.com/1280x720.png?text=Test+Screenshot",
            capturedAt: new Date().toISOString(),
          };
          await runWithPanel(
            out4,
            {
              method: "POST",
              url: `/work-session/${sid}/screenshots`,
              payload,
            },
            () =>
              api(`/work-session/${sid}/screenshots`, {
                method: "POST",
                body: payload,
              }),
          );
        }, "success"),
        input("capInterval", "interval (sec, min 5)", "30", { class: "w-32" }),
        el(
          "button",
          {
            id: "autoCapBtn",
            class:
              "px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700",
            onclick: async () => {
              if (capture.timer) {
                stopAutoCapture();
              } else {
                try {
                  await startAutoCapture();
                } catch (err) {
                  alert("Could not start capture: " + err.message);
                }
              }
            },
          },
          "🎬 Start auto-capture",
        ),
        el(
          "span",
          { class: "text-xs text-slate-500 flex items-center px-2" },
          ["status: ", el("code", { id: "capStatus" }, "idle")],
        ),
        button("List for session", async () => {
          const sid = document.getElementById("screenSid").value.trim();
          await runWithPanel(
            out4,
            { method: "GET", url: `/work-session/${sid}/screenshots` },
            () => api(`/work-session/${sid}/screenshots`),
          );
        }),
        input("screenDel", "screenshotId (to delete)"),
        button("Delete", async () => {
          const id = document.getElementById("screenDel").value.trim();
          await runWithPanel(
            out4,
            { method: "DELETE", url: `/work-session/screenshots/${id}` },
            () =>
              api(`/work-session/screenshots/${id}`, { method: "DELETE" }),
          );
        }, "danger"),
      ],
      out4,
    ),
  );

  // ── 5. Activity events (apps + websites + keystroke + mouse) ─
  const out5 = el("div", { class: "border rounded p-2 min-h-[60px] mt-2" });
  host.appendChild(
    featureRow(
      "5. Activity events (batch upload — apps / websites / keystroke / mouse)",
      [
        input("actSid", "sessionId"),
        input("actOrg", "organizationId", defaultOrgId),
        button("Send sample batch (4 events)", async () => {
          const sid = document.getElementById("actSid").value.trim();
          const orgId = document.getElementById("actOrg").value.trim();
          const now = new Date();
          const minus = (m) =>
            new Date(now.getTime() - m * 60_000).toISOString();
          const payload = {
            events: [
              {
                organizationId: orgId,
                type: "mouse",
                bucketAt: minus(2),
                count: 38,
              },
              {
                organizationId: orgId,
                type: "keystroke",
                bucketAt: minus(2),
                count: 142,
              },
              {
                organizationId: orgId,
                type: "app_usage",
                bucketAt: minus(5),
                startTime: minus(5),
                endTime: minus(2),
                app: "Visual Studio Code",
              },
              {
                organizationId: orgId,
                type: "website_visit",
                bucketAt: minus(3),
                startTime: minus(3),
                endTime: minus(2),
                domain: "github.com",
                url: "https://github.com/Maitha-jrd",
              },
            ],
          };
          await runWithPanel(
            out5,
            {
              method: "POST",
              url: `/work-session/${sid}/activity-events`,
              payload,
            },
            () =>
              api(`/work-session/${sid}/activity-events`, {
                method: "POST",
                body: payload,
              }),
          );
        }, "success"),
        button("Query my events", async () => {
          await runWithPanel(
            out5,
            { method: "GET", url: "/work-session/activity-events" },
            () => api("/work-session/activity-events"),
          );
        }),
      ],
      out5,
    ),
  );

  // ── 6. Dashboards (productivity scores) ──────────────────
  const out6 = el("div", { class: "border rounded p-2 min-h-[60px] mt-2" });
  host.appendChild(
    featureRow(
      "6. Productivity dashboards",
      [
        input("dashOrg", "orgId", defaultOrgId),
        input("dashFrom", "from (ISO date, optional)"),
        input("dashTo", "to (ISO date, optional)"),
        button("/dashboards/me", async () => {
          const orgId = document.getElementById("dashOrg").value.trim();
          const from = document.getElementById("dashFrom").value;
          const to = document.getElementById("dashTo").value;
          const qs = new URLSearchParams(
            Object.entries({ orgId, from, to }).filter(([, v]) => v),
          );
          const url = `/dashboards/me?${qs}`;
          await runWithPanel(
            out6,
            { method: "GET", url },
            () => api(url),
          );
        }, "success"),
        button("/dashboards/org/:orgId (admin)", async () => {
          const orgId = document.getElementById("dashOrg").value.trim();
          const from = document.getElementById("dashFrom").value;
          const to = document.getElementById("dashTo").value;
          const qs = new URLSearchParams(
            Object.entries({ from, to }).filter(([, v]) => v),
          );
          const url = `/dashboards/org/${orgId}?${qs}`;
          await runWithPanel(
            out6,
            { method: "GET", url },
            () => api(url),
          );
        }),
      ],
      out6,
    ),
  );

  // ── 7. Real-time admin stream note ───────────────────────
  host.appendChild(
    card(
      "7. Real-time admin stream (live)",
      el("div", { class: "text-sm text-slate-600 space-y-1" }, [
        el("div", {}, [
          "Activity event uploads also broadcast on the ",
          el("code", { class: "bg-slate-100 px-1" }, "/admin"),
          " Socket.IO namespace as ",
          el("code", { class: "bg-slate-100 px-1" }, "activity:batch"),
          " events.",
        ]),
        el("div", {}, [
          "To see them live: open the ",
          el("strong", {}, "Realtime"),
          " tab → in the Chat namespace panel change ",
          el("code", { class: "bg-slate-100 px-1" }, "/chat"),
          " to ",
          el("code", { class: "bg-slate-100 px-1" }, "/admin"),
          " → Connect → emit ",
          el("code", { class: "bg-slate-100 px-1" }, "admin:subscribe"),
          " with ",
          el("code", { class: "bg-slate-100 px-1" }, '{"orgId":"<id>"}'),
          " → upload a batch from this tab → live events show up in the log.",
        ]),
      ]),
    ),
  );
}

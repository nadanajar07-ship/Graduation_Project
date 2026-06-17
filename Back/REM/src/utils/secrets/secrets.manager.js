// src/utils/secrets/secrets.manager.js
//
// Bootstrap hook that runs FIRST in index.js, before any other init.
// Its job is to guarantee that the security-critical secrets are present
// and well-formed before the rest of the app (token signing, email,
// uploads, OAuth, LiveKit …) tries to read them.
//
// Env loading + schema validation already happens in `src/config/env.js`
// (joi, with process.exit(1) on failure). This module is the explicit
// "secrets are ready" gate the bootstrap comment refers to, and the seam
// where a real secret store (Vault / Doppler / AWS Secrets Manager) would
// be wired in for production without touching the rest of the bootstrap.
//
// NOTE: this file lives under a `secrets/` directory, which the repo
// .gitignore historically swallowed wholesale — keep it tracked
// (it contains *no* secret values, only the loader logic).

import { config } from "../../config/index.js";
import { logger } from "../logger/logger.js";

// Secrets the app cannot run safely without. Each is already required by
// the joi schema, but we re-assert here so a partially-configured deploy
// fails loudly at the secrets gate rather than mid-request.
const REQUIRED_SECURITY_SECRETS = [
  ["security.userAccessSecret", config.security.userAccessSecret],
  ["security.userRefreshSecret", config.security.userRefreshSecret],
  ["security.adminAccessSecret", config.security.adminAccessSecret],
  ["security.adminRefreshSecret", config.security.adminRefreshSecret],
];

/**
 * Validate that all required secrets are present (and, for the JWT signing
 * keys, long enough to be safe with HS256). Throws on the first problem so
 * the process aborts before binding the HTTP port.
 */
export async function initSecrets() {
  const missing = REQUIRED_SECURITY_SECRETS.filter(
    ([, value]) => !value || String(value).length < 32,
  ).map(([name]) => name);

  if (missing.length > 0) {
    logger.error(
      { missing },
      "secrets gate failed — required signing secrets are missing or too short",
    );
    throw new Error(
      `Missing or invalid security secrets: ${missing.join(", ")}. ` +
        "Generate them with `npm run` → scripts/generate-secrets.js and " +
        "paste into src/config/.env.dev.",
    );
  }

  // Optional integrations: warn (don't crash) so dev can run without them.
  if (!config.livekit?.enabled) {
    logger.warn(
      "LiveKit secrets not fully configured — voice/video token minting disabled",
    );
  }

  logger.info(
    {
      securitySecrets: REQUIRED_SECURITY_SECRETS.length,
      livekit: Boolean(config.livekit?.enabled),
    },
    "secrets initialised",
  );
}

export default { initSecrets };

/**
 * modules/audit/audit.controller.js
 *
 *   GET /audit-logs?orgId=&page=&limit=&action=&outcome=&search=&from=&to=
 *
 * Read-only view over the append-only AuditLog collection (security /
 * compliance trail). Org owner/admin only — audit logs expose who did
 * what (logins, role changes, deletions) across the whole org, so plain
 * members must not see them.
 *
 * `action` is matched as a PREFIX ("auth" → "auth.login.success", …) to
 * line up with the frontend's domain tabs (All / Auth / Organization /
 * Teams). Records are append-only; there is intentionally no write,
 * update, or delete endpoint here.
 */

import { Router } from "express";
import joi from "joi";
import { authentication } from "../../middleware/auth.middleware.js";
import {
  validation,
  generalFields,
} from "../../middleware/validation.middleware.js";
import { asyncHandler } from "../../utils/response/error.response.js";
import { successResponse } from "../../utils/response/success.response.js";
import { requireOrgAdmin } from "../../utils/permissions/org.permissions.js";
import auditLogModel from "../../DB/Model/auditLog.model.js";

const router = Router();
router.use(authentication());

// Escape user input before using it inside a RegExp so a stray "." or
// "(" in the search box can't blow up the query or match unexpectedly.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listSchema = joi
  .object({
    orgId: generalFields.id.required(),
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(20),
    // allow("") so a blank filter param is treated as "no filter" rather
    // than a 400 (the FE omits empty params, but be defensive).
    action: joi.string().trim().max(100).allow(""),
    outcome: joi.string().valid("success", "failure", "denied", ""),
    search: joi.string().trim().max(200).allow(""),
    from: joi.date().iso(),
    to: joi.date().iso(),
  })
  .required();

// GET /audit-logs
router.get(
  "/",
  validation(listSchema),
  asyncHandler(async (req, res) => {
    const { orgId } = req.query;
    await requireOrgAdmin(orgId, req.user._id);

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const filter = { orgId };
    // Prefix match on the dot-namespaced action ("auth" → auth.*).
    if (req.query.action)
      filter.action = { $regex: "^" + escapeRegExp(req.query.action) };
    if (req.query.outcome) filter.outcome = req.query.outcome;

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    // Free-text search spans the action name and request fingerprint
    // (IP / user-agent) — the fields an admin actually scans for.
    if (req.query.search) {
      const rx = { $regex: escapeRegExp(req.query.search), $options: "i" };
      filter.$or = [
        { action: rx },
        { ipAddress: rx },
        { userAgent: rx },
        { targetType: rx },
      ];
    }

    const [items, total] = await Promise.all([
      auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("actorId", "username fullName email image")
        .lean(),
      auditLogModel.countDocuments(filter),
    ]);

    return successResponse({
      res,
      data: {
        items,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  }),
);

export default router;

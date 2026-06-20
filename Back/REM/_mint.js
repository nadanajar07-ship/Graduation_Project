import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "./src/config/.env.dev" });
import userModel from "./src/DB/Model/user.model.js";
import memberModel from "./src/DB/Model/member.model.js";
import orgModel from "./src/DB/Model/organization.model.js";
import { generateToken } from "./src/utils/security/token.security.js";
import { config } from "./src/config/index.js";
const gen = (id) => generateToken({ payload: { id }, signature: config.security.userAccessSecret, expiresIn: "3h" });

await mongoose.connect(process.env.DB_URI);
const emails = ["qaowner@example.com", "qamember@example.com", "qaviewer@example.com"];
const out = {};
for (const email of emails) {
  const u = await userModel.findOne({ email }).select("_id username role").lean();
  if (!u) { console.log(email, "MISSING"); continue; }
  const mem = await memberModel.find({ userId: u._id, isActive: true }).select("organizationId role").lean();
  out[email] = { id: String(u._id), token: gen(u._id), orgs: mem.map(m => ({ org: String(m.organizationId), role: m.role })) };
}
import fs from "node:fs";
fs.writeFileSync("_tokens.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await mongoose.disconnect();

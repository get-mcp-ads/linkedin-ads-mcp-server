#!/usr/bin/env node
/**
 * Reports which configuration variables are present, never their values, and
 * whether this Node.js release carries the October 2026 security fixes.
 * Run it after `npm run build`.
 */
const access = ["LINKEDIN_ADS_ACCESS_TOKEN"];
const refresh = ["LINKEDIN_ADS_REFRESH_TOKEN", "LINKEDIN_ADS_CLIENT_ID", "LINKEDIN_ADS_CLIENT_SECRET"];
const required = ["LINKEDIN_ADS_ACCOUNT_IDS"];
const optional = ["LINKEDIN_ADS_SCOPES", "LINKEDIN_ADS_ENABLE_WRITES", "LINKEDIN_ADS_API_VERSION", "LINKEDIN_ADS_LOG_LEVEL"];

const present = (name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0;

let runtimeWarning;
try {
  ({ nodeRuntimeWarning: runtimeWarning } = await import("../dist/index.js"));
} catch {
  runtimeWarning = undefined;
}
const warning = runtimeWarning ? runtimeWarning() : "Build first (npm run build) to check the Node.js release.";
if (warning) console.error(`[linkedin-ads-mcp] WARN runtime: ${warning}`);

const accounts = (process.env.LINKEDIN_ADS_ACCOUNT_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const writes = process.env.LINKEDIN_ADS_ENABLE_WRITES ?? "false";
const credentials = access.every(present) || refresh.every(present);
const result = {
  package: "@getmcpads/linkedin-ads-mcp-server",
  ok: credentials && accounts.length > 0 && accounts.every((id) => /^\d+$/.test(id)) && ["true", "false"].includes(writes),
  node: { version: process.versions.node, warning: warning ?? null },
  auth: {
    accessTokenMode: access.every(present),
    refreshTokenMode: refresh.every(present),
    variables: [...access, ...refresh].map((name) => ({ name, present: present(name) })),
  },
  accounts: { configured: accounts.length, numeric: accounts.every((id) => /^\d+$/.test(id)) },
  writes: writes === "true" ? "enabled" : writes === "false" ? "disabled" : "invalid value, use true or false",
  settings: [...required, ...optional].map((name) => ({ name, present: present(name) })),
  note: "Set LINKEDIN_ADS_ACCESS_TOKEN, or the three refresh variables, and LINKEDIN_ADS_ACCOUNT_IDS.",
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

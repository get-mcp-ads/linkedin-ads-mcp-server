/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";

/**
 * The Marketing API version this server requests.
 *
 * LinkedIn refuses every versioned call without a `LinkedIn-Version` header,
 * and supports each monthly version for at least a year. The default is pinned
 * rather than derived from the date: a computed version could name a month
 * LinkedIn has not published yet, and every call would then fail with 426.
 */
export const LINKEDIN_DEFAULT_VERSION = "202608";

/** LinkedIn ad account IDs are numeric. One request lists up to 100 accounts. */
export const MAX_ALLOWED_ACCOUNTS = 100;

const schema = z
  .object({
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    allowedAccountIds: z.array(z.string().regex(/^\d{1,20}$/)).min(1).max(MAX_ALLOWED_ACCOUNTS),
    scopes: z.array(z.string().regex(/^[A-Za-z_]+$/)).optional(),
    enableWrites: z.boolean().prefault(false),
    apiVersion: z.string().regex(/^\d{6}$/).prefault(LINKEDIN_DEFAULT_VERSION),
    logLevel: z.enum(["debug", "info", "warn", "error"]).prefault("info"),
  })
  .strict();

export type LinkedInConfig = z.infer<typeof schema>;
export type LinkedInConfigInput = z.input<typeof schema>;

const SETUP_HINT =
  "Set LINKEDIN_ADS_ACCESS_TOKEN, or LINKEDIN_ADS_REFRESH_TOKEN with LINKEDIN_ADS_CLIENT_ID and LINKEDIN_ADS_CLIENT_SECRET, " +
  "and LINKEDIN_ADS_ACCOUNT_IDS with 1 to 100 comma-separated numeric ad account IDs from Campaign Manager.";

/**
 * Validates a configuration object. Error messages name the variables to fix
 * and never repeat a submitted value, so a token cannot leak through them.
 */
export function validateConfig(value: unknown): LinkedInConfig {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "configuration")))];
    throw new Error(`Invalid LinkedIn Ads configuration (${fields.join(", ")}). ${SETUP_HINT}`);
  }
  const config = result.data;
  if (!config.accessToken && !(config.refreshToken && config.clientId && config.clientSecret)) {
    throw new Error(`Missing LinkedIn credentials. ${SETUP_HINT}`);
  }
  if ((config.refreshToken || config.clientId || config.clientSecret) && !(config.refreshToken && config.clientId && config.clientSecret)) {
    throw new Error(
      "LINKEDIN_ADS_REFRESH_TOKEN, LINKEDIN_ADS_CLIENT_ID and LINKEDIN_ADS_CLIENT_SECRET are used together. Set all three, or none of them.",
    );
  }
  return { ...config, allowedAccountIds: [...new Set(config.allowedAccountIds)] };
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function list(value: string | undefined, separator: RegExp): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}

/** Reads the configuration from LINKEDIN_ADS_* environment variables. */
export function loadConfig(): LinkedInConfig {
  const writes = optional("LINKEDIN_ADS_ENABLE_WRITES") ?? "false";
  if (writes !== "true" && writes !== "false") {
    throw new Error("LINKEDIN_ADS_ENABLE_WRITES must be exactly true or false. Writes stay disabled unless it is true.");
  }
  const accountIds = list(optional("LINKEDIN_ADS_ACCOUNT_IDS"), /,/) ?? [];
  return validateConfig({
    accessToken: optional("LINKEDIN_ADS_ACCESS_TOKEN"),
    refreshToken: optional("LINKEDIN_ADS_REFRESH_TOKEN"),
    clientId: optional("LINKEDIN_ADS_CLIENT_ID"),
    clientSecret: optional("LINKEDIN_ADS_CLIENT_SECRET"),
    allowedAccountIds: accountIds.map((id) => id.replace(/^urn:li:sponsoredAccount:/, "")),
    scopes: list(optional("LINKEDIN_ADS_SCOPES"), /[\s,]+/),
    enableWrites: writes === "true",
    apiVersion: optional("LINKEDIN_ADS_API_VERSION") ?? LINKEDIN_DEFAULT_VERSION,
    logLevel: optional("LINKEDIN_ADS_LOG_LEVEL") ?? "info",
  });
}

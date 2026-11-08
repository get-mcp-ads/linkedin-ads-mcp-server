/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { LinkedInConfig } from "../../config.js";
import { formatMcpToolError, LinkedInMcpError } from "../../core/errors.js";
import { Redactor } from "../../core/redact.js";
import { LinkedInAuth } from "./auth.js";
import { LinkedInClient } from "./client.js";
import { LinkedInAdsApi } from "./native.js";
import { LinkedInTransport } from "./transport.js";
import type { NativeObject } from "./transport.js";

export type ToolShape = Record<string, z.ZodTypeAny>;
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export type ResourceResult = { contents: { uri: string; mimeType: string; text: string }[] };

/** What the tool and resource registrations need from an MCP server. Tests pass a plain collector. */
export type Collector = {
  tool(name: string, description: string, shape: ToolShape, handler: (args: Record<string, unknown>) => Promise<ToolResult>): void;
  resource?(name: string, uri: string, read: () => Promise<ResourceResult>): void;
};

export type LinkedInContext = {
  config: LinkedInConfig;
  auth: LinkedInAuth;
  redactor: Redactor;
  /** Signs upload receipts. Generated per process, so receipts end with it. */
  receiptKey: Buffer;
  sleep?: (ms: number) => Promise<void>;
};

/** Per-call LinkedIn handles. A fresh set per call keeps caches and mutation counts call-local. */
export type CallDeps = {
  transport: LinkedInTransport;
  client: LinkedInClient;
  api: LinkedInAdsApi;
};

export function createContext(config: LinkedInConfig, options: { sleep?: (ms: number) => Promise<void> } = {}): LinkedInContext {
  const redactor = new Redactor();
  return {
    config,
    auth: new LinkedInAuth(config, redactor),
    redactor,
    receiptKey: randomBytes(32),
    sleep: options.sleep,
  };
}

function deps(ctx: LinkedInContext): CallDeps {
  const transport = new LinkedInTransport(ctx.auth, ctx.config.apiVersion, ctx.sleep);
  return { transport, client: new LinkedInClient(transport), api: new LinkedInAdsApi(transport) };
}

export const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

function redacted(ctx: LinkedInContext, result: ToolResult): ToolResult {
  return { ...result, content: result.content.map((item) => ({ ...item, text: ctx.redactor.apply(item.text) })) };
}

export const accountIdSchema = z
  .string()
  .regex(/^\d+$/)
  .describe("Selected LinkedIn advertising account, numeric ID. It must be listed in LINKEDIN_ADS_ACCOUNT_IDS.");

export const confirmSchema = z
  .boolean()
  .prefault(false)
  .describe("Preview unless true. Apply only after the person explicitly approved this exact change, in an account where their LinkedIn role allows it.");

/** Refuses an account outside LINKEDIN_ADS_ACCOUNT_IDS before any request is made. */
export function assertAllowed(ctx: LinkedInContext, adAccountId: string): void {
  if (!ctx.config.allowedAccountIds.includes(adAccountId)) {
    throw new LinkedInMcpError(`Ad account ${adAccountId} is not listed in LINKEDIN_ADS_ACCOUNT_IDS, so this server does not access it.`, 403);
  }
}

const CHILD_FILTERS: Record<string, string> = {
  campaignIds: "adCampaigns",
  campaignGroupIds: "adCampaignGroups",
  creativeIds: "creatives",
  campaignGroupId: "adCampaignGroups",
};

type ReadOptions = {
  /** "required" adds adAccountId and checks it; "optional" checks it when given; "none" makes no account request. */
  account: "required" | "optional" | "none";
  /** Verify that campaign, group and creative filters belong to the account before the call. */
  verifyChildren?: boolean;
};

/** Registers a read tool behind the allowlist, ownership checks and redaction. */
export function addRead(
  c: Collector,
  ctx: LinkedInContext,
  name: string,
  description: string,
  shape: ToolShape,
  handler: (args: NativeObject, deps: CallDeps) => Promise<unknown>,
  options: ReadOptions,
): void {
  const full: ToolShape = options.account === "required" ? { adAccountId: accountIdSchema, ...shape } : shape;
  const schema = z.object(full).strict();
  c.tool(name, description, full, async (raw) => {
    try {
      const args = schema.parse(raw) as NativeObject;
      if (options.account !== "none" && args.adAccountId !== undefined) assertAllowed(ctx, String(args.adAccountId));
      const call = deps(ctx);
      if (options.verifyChildren) {
        for (const [key, kind] of Object.entries(CHILD_FILTERS)) {
          const values = Array.isArray(args[key]) ? args[key] : args[key] === undefined ? [] : [args[key]];
          for (const child of values) await call.api.owned(args.adAccountId, kind, String(child).split(":").pop()!);
        }
      }
      return redacted(ctx, ok(await handler(args, call)));
    } catch (error) {
      return redacted(ctx, formatMcpToolError(error));
    }
  });
}

/** Fields whose change can alter what an already running campaign spends. */
const SPEND_FIELDS = ["dailyBudget", "unitCost", "runSchedule", "targetingCriteria"];

/**
 * Registers a write tool.
 *
 * Order matters: the allowlist and the granted scopes are checked first, then
 * the ad account is read to confirm it can change, and only a call with
 * confirm: true goes further. A failed write says whether a mutation reached
 * LinkedIn, and is never retried by this server.
 */
export function addWrite(
  c: Collector,
  ctx: LinkedInContext,
  name: string,
  description: string,
  shape: ToolShape,
  handler: (args: NativeObject, deps: CallDeps) => Promise<Record<string, unknown>>,
): void {
  const full: ToolShape = { adAccountId: accountIdSchema, ...shape, confirm: confirmSchema };
  const schema = z.object(full).strict();
  c.tool(name, description, full, async (raw) => {
    let call: CallDeps | undefined;
    try {
      const args = schema.parse(raw) as NativeObject;
      assertAllowed(ctx, args.adAccountId);
      const scopes = ctx.config.scopes;
      if (scopes !== undefined && !scopes.includes("rw_ads")) {
        throw new LinkedInMcpError("LINKEDIN_ADS_SCOPES does not include rw_ads, which every write needs. Authorize the app with rw_ads.", 403);
      }
      call = deps(ctx);
      await call.api.requireWriteAccount(args.adAccountId);
      if (!args.confirm) {
        const fields = (args.fields ?? {}) as Record<string, unknown>;
        return redacted(
          ctx,
          ok({
            applied: false,
            action: name,
            adAccountId: args.adAccountId,
            change: { ...args, confirm: undefined, bytesBase64: args.bytesBase64 ? "[file bytes omitted]" : undefined },
            activationOffered: false,
            mayChangeSpend: name === "linkedin_update_entity" && SPEND_FIELDS.some((key) => key in fields),
            note: "Preview only. Nothing was changed. Ask the person to approve these exact parameters, then repeat the call with confirm: true.",
          }),
        );
      }
      return redacted(ctx, ok({ applied: true, action: name, ...(await handler(args, call)) }));
    } catch (error) {
      const sent = (call?.transport.mutationsSent ?? 0) > 0;
      return redacted(
        ctx,
        formatMcpToolError(error, {
          outcome: sent ? "verify_before_retry" : "not_applied",
          retrySafe: !sent,
        }),
      );
    }
  });
}

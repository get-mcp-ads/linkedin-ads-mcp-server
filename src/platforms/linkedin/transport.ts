/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { LinkedInMcpError } from "../../core/errors.js";
import { LINKEDIN_API_BASE, LinkedInTransportError, sendRequest } from "../../core/http.js";
import type { LinkedInAuth } from "./auth.js";

// LinkedIn payloads are open Rest.li records; their shape depends on the resource and version.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NativeObject = Record<string, any>;
export type LinkedInResult = { status: number; id?: string; data: NativeObject };

/** Resource roots this server reads or writes. Anything else is refused before a request. */
const ROOTS = /^\/(adAccounts|adAccountUsers|adAnalytics|adTargetingEntities|images|videos|posts)(?:[/?]|$)/;

/** Rest.li answers at most this much for one call. adAnalytics caps a report at 15,000 rows. */
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Authenticated access to the LinkedIn Marketing API.
 *
 * Reads retry transient failures: a network error, HTTP 429 or a 5xx, at most
 * twice, honouring Retry-After up to ten seconds, and renew the token once on
 * 401. A mutation is sent exactly once. Its failure is reported, never
 * retried, because a write whose answer was lost may still have been applied.
 */
export class LinkedInTransport {
  /** Mutations sent through this transport, counted so a failed write can say whether it reached LinkedIn. */
  mutationsSent = 0;

  constructor(
    private readonly auth: LinkedInAuth,
    readonly version: string,
    private readonly sleep: (ms: number) => Promise<void> = delay,
  ) {}

  async call(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: NativeObject,
    headers: Record<string, string> = {},
  ): Promise<LinkedInResult> {
    assertPath(path);
    if (!/^\d{6}$/.test(this.version)) throw new LinkedInMcpError("LINKEDIN_ADS_API_VERSION must be YYYYMM.", 400);
    return method === "GET" ? this.read(path, headers) : this.mutate(method, path, body, headers);
  }

  private async read(path: string, headers: Record<string, string>, attempt = 0, renewed = false): Promise<LinkedInResult> {
    const token = await this.auth.token();
    let result;
    try {
      result = await this.send("GET", path, token, undefined, headers);
    } catch (error) {
      if (error instanceof LinkedInTransportError && attempt < 2) {
        await this.sleep(250 * 2 ** attempt);
        return this.read(path, headers, attempt + 1, renewed);
      }
      throw error;
    }
    if (result.status === 401 && !renewed && this.auth.canRefresh()) {
      this.auth.invalidate(token);
      await this.auth.refresh();
      return this.read(path, headers, attempt, true);
    }
    if ((result.status === 429 || result.status >= 500) && attempt < 2) {
      await this.sleep(retryDelayMs(result.headers.get("retry-after"), attempt));
      return this.read(path, headers, attempt + 1, renewed);
    }
    return parse(result);
  }

  private async mutate(
    method: "POST" | "DELETE",
    path: string,
    body: NativeObject | undefined,
    headers: Record<string, string>,
  ): Promise<LinkedInResult> {
    const token = await this.auth.token();
    this.mutationsSent += 1;
    let result;
    try {
      result = await this.send(method, path, token, body, headers);
    } catch (error) {
      if (error instanceof LinkedInTransportError) {
        throw new LinkedInTransportError(
          `${error.message} The change may or may not have been applied: read the entity before trying again.`,
        );
      }
      throw error;
    }
    if (result.status === 401) this.auth.invalidate(token);
    return parse(result);
  }

  private send(method: string, path: string, token: string, body: NativeObject | undefined, headers: Record<string, string>) {
    return sendRequest(`${LINKEDIN_API_BASE}${path}`, {
      method: method as "GET" | "POST" | "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": this.version,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      timeoutMs: 30_000,
      maxBytes: MAX_RESPONSE_BYTES,
    });
  }
}

function parse(result: { status: number; headers: Headers; text: string }): LinkedInResult {
  let data: NativeObject = {};
  if (result.text) {
    try {
      data = JSON.parse(result.text) as NativeObject;
    } catch {
      throw new LinkedInMcpError(`LinkedIn returned a response that is not JSON (HTTP ${result.status}).`, result.status);
    }
  }
  if (result.status < 200 || result.status >= 300) {
    const details = data.errorDetails ? ` ${JSON.stringify(data.errorDetails)}` : "";
    const message = typeof data.message === "string" && data.message ? data.message : "LinkedIn API request failed";
    throw new LinkedInMcpError(
      `${message} (HTTP ${result.status})${details}`.slice(0, 800),
      result.status,
      typeof data.serviceErrorCode === "number" || typeof data.serviceErrorCode === "string" ? data.serviceErrorCode : undefined,
    );
  }
  const header = result.headers.get("x-restli-id");
  const id = header ?? (data.id !== undefined ? String(data.id) : typeof data.value?.creative === "string" ? data.value.creative : undefined);
  return { status: result.status, ...(id ? { id } : {}), data };
}

function assertPath(path: string): void {
  const [pathname] = path.split("?");
  if (!ROOTS.test(path) || /[\\#\s]/.test(path) || /\.\.|%2e|%2f|%5c/i.test(pathname!)) {
    throw new LinkedInMcpError("Refused a LinkedIn API path outside the resources this server uses.", 400);
  }
}

export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(retryAt - Date.now(), 0), 10_000);
  }
  return Math.min(500 * 2 ** attempt, 4_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

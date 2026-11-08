/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LinkedInConfig } from "../../config.js";
import { LinkedInMcpError } from "../../core/errors.js";
import { LINKEDIN_TOKEN_URL, sendRequest } from "../../core/http.js";
import type { Redactor } from "../../core/redact.js";

/**
 * Holds the LinkedIn access token in memory.
 *
 * With refresh credentials the token is renewed through the OAuth token
 * endpoint when it is missing, close to expiry or refused with 401. Renewed
 * tokens stay in this process: nothing is written to disk, logged or returned
 * by a tool. LinkedIn issues programmatic refresh tokens only to apps approved
 * for them; without one, a token lasts 60 days and is then replaced by hand.
 */
export class LinkedInAuth {
  private accessToken?: string;
  private refreshToken?: string;
  private expiresAt?: number;
  private pending?: Promise<string>;

  constructor(
    private readonly config: Pick<LinkedInConfig, "accessToken" | "refreshToken" | "clientId" | "clientSecret">,
    private readonly redactor: Redactor,
  ) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    redactor.add(config.accessToken);
    redactor.add(config.refreshToken);
    redactor.add(config.clientSecret);
  }

  canRefresh(): boolean {
    return Boolean(this.refreshToken && this.config.clientId && this.config.clientSecret);
  }

  hasCredentials(): boolean {
    return Boolean(this.accessToken) || this.canRefresh();
  }

  /** A usable access token, renewed first when it is known to be expiring. */
  async token(): Promise<string> {
    const fresh = this.accessToken && (this.expiresAt === undefined || Date.now() < this.expiresAt - 60_000);
    if (fresh) return this.accessToken!;
    if (this.canRefresh()) return this.refresh();
    if (this.accessToken) return this.accessToken;
    throw new LinkedInMcpError("No LinkedIn access token is configured.", 401);
  }

  /** Forgets a token LinkedIn refused, so the next call renews it. */
  invalidate(token: string): void {
    if (this.accessToken === token) {
      this.accessToken = undefined;
      this.expiresAt = undefined;
    }
  }

  /** Renews the access token once, even when several calls ask at the same time. */
  refresh(): Promise<string> {
    if (!this.canRefresh()) {
      return Promise.reject(
        new LinkedInMcpError(
          "The LinkedIn access token was refused and no refresh credentials are configured. " +
            "LinkedIn only issues refresh tokens to apps approved for them; otherwise set a new LINKEDIN_ADS_ACCESS_TOKEN every 60 days.",
          401,
        ),
      );
    }
    this.pending ??= this.exchange().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async exchange(): Promise<string> {
    const result = await sendRequest(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken!,
        client_id: this.config.clientId!,
        client_secret: this.config.clientSecret!,
      }),
      timeoutMs: 30_000,
      maxBytes: 64 * 1024,
    });
    let payload: Record<string, unknown> = {};
    try {
      payload = result.text ? (JSON.parse(result.text) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    const accessToken = payload.access_token;
    const expiresIn = payload.expires_in;
    if (result.status < 200 || result.status >= 300 || typeof accessToken !== "string" || !accessToken) {
      // The provider payload is not relayed: only a short error code, never its text.
      const code = typeof payload.error === "string" && /^[a-z_]{1,40}$/.test(payload.error) ? ` (${payload.error})` : "";
      throw new LinkedInMcpError(
        `LinkedIn refused the token refresh with HTTP ${result.status}${code}. The refresh token may be expired or revoked: ` +
          "authorize the app again and set new credentials.",
        401,
      );
    }
    if (expiresIn !== undefined && (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0)) {
      throw new LinkedInMcpError("LinkedIn returned an invalid token refresh response.", 502);
    }
    this.redactor.add(accessToken);
    this.accessToken = accessToken;
    this.expiresAt = typeof expiresIn === "number" ? Date.now() + expiresIn * 1000 : undefined;
    if (typeof payload.refresh_token === "string" && payload.refresh_token) {
      this.redactor.add(payload.refresh_token);
      this.refreshToken = payload.refresh_token;
    }
    return accessToken;
  }
}

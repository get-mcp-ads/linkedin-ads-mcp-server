/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Removes every known credential from text before it reaches the model.
 *
 * The configured access token, refresh token and client secret are registered
 * at startup, and every token minted by a refresh is registered as soon as it
 * arrives. Bearer headers and token parameters are masked by pattern as well,
 * in case a provider echoes one that was never registered here.
 */
export class Redactor {
  private readonly secrets = new Set<string>();

  add(value: string | undefined): void {
    if (value && value.length >= 8) this.secrets.add(value);
  }

  apply(text: string): string {
    let out = text;
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length)) {
      out = out.split(secret).join("[redacted]");
    }
    return out
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]")
      .replace(/((?:access_token|refresh_token|client_secret|oauth2_access_token)["']?\s*[=:]\s*["']?)[^"'&\s,}]+/gi, "$1[redacted]");
  }
}

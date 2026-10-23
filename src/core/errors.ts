/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
export class LinkedInMcpError extends Error {
  readonly statusCode?: number;
  readonly serviceErrorCode?: number | string;

  constructor(message: string, statusCode?: number, serviceErrorCode?: number | string) {
    super(message);
    this.name = "LinkedInMcpError";
    this.statusCode = statusCode;
    this.serviceErrorCode = serviceErrorCode;
  }
}

/**
 * Turns the most common LinkedIn refusals into an actionable sentence.
 *
 * Rest.li messages describe the mechanics, not the cause: "Invalid query
 * parameters passed to request" does not say that the app lacks the
 * Advertising API product. An agent that only reads that message loops.
 */
export function explain(statusCode: number | undefined, message: string): string {
  if (statusCode === 401) {
    return `${message} The LinkedIn access token is missing, expired or revoked. LinkedIn access tokens last 60 days. Set a renewed LINKEDIN_ADS_ACCESS_TOKEN, or the refresh credentials, and restart the server.`;
  }
  if (statusCode === 403) {
    return `${message} The authenticated member has no suitable role on this ad account, or the app is missing the r_ads, r_ads_reporting or rw_ads scope. With Development tier access, writes also need this exact ad account ID added to the app's Advertising API account list in the LinkedIn Developer Portal.`;
  }
  if (statusCode === 426) {
    return `${message} LinkedIn refused the API version. Set LINKEDIN_ADS_API_VERSION to a supported YYYYMM version.`;
  }
  if (statusCode === 429) {
    return `${message} LinkedIn throttled the request. Reporting is capped at 45 million metric values per five minutes, so ask for fewer fields or a narrower date range.`;
  }
  return message;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatMcpToolError(error: unknown, extra: Record<string, unknown> = {}) {
  const message = errorMessage(error);
  const statusCode = error instanceof LinkedInMcpError ? error.statusCode : undefined;
  const serviceErrorCode = error instanceof LinkedInMcpError ? error.serviceErrorCode : undefined;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: false,
            error: explain(statusCode, message),
            statusCode,
            serviceErrorCode,
            ...extra,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

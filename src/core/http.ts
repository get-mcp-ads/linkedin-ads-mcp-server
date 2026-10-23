/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * The one place where this server reaches the network.
 *
 * Every destination is listed below. Requests never follow a redirect, always
 * carry a timeout and read at most a bounded number of bytes. A test fails the
 * build if another host appears in the source, or if a request omits the
 * redirect refusal.
 */
import { LinkedInMcpError } from "./errors.js";

/** Marketing API, under its versioned /rest root. Carries the bearer token. */
export const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";
/** OAuth token endpoint, used only to refresh the access token in memory. */
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
/** Signed upload URLs returned by the Images and Videos APIs. No credential is sent there. */
export const LINKEDIN_UPLOAD_ORIGIN = "https://www.linkedin.com";
export const LINKEDIN_UPLOAD_PATH_PREFIX = "/dms-uploads/";
/** Media download URLs are returned to the client as data and never requested by this server. */
export const LINKEDIN_MEDIA_HOST_SUFFIX = ".licdn.com";

const API_HOST = new URL(LINKEDIN_API_BASE).hostname;
const TOKEN = new URL(LINKEDIN_TOKEN_URL);
const UPLOAD_HOST = new URL(LINKEDIN_UPLOAD_ORIGIN).hostname;

export type Destination = "api" | "token" | "upload";

/** A request that left this process without a readable answer. Its outcome is unknown. */
export class LinkedInTransportError extends LinkedInMcpError {
  readonly uncertain = true;
}

function plainHttps(url: URL): boolean {
  return url.protocol === "https:" && !url.username && !url.password && (url.port === "" || url.port === "443");
}

/** Refuses any destination outside the fixed LinkedIn endpoints above. */
export function assertAllowedDestination(url: URL): Destination {
  if (plainHttps(url)) {
    if (url.hostname === API_HOST && url.pathname.startsWith("/rest/")) return "api";
    if (url.hostname === TOKEN.hostname && url.pathname === TOKEN.pathname) return "token";
    if (url.hostname === UPLOAD_HOST && url.pathname.startsWith(LINKEDIN_UPLOAD_PATH_PREFIX)) return "upload";
  }
  throw new LinkedInMcpError("Refused a request to a destination outside the LinkedIn API, token and upload endpoints.", 400);
}

function privateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * Validates a URL that the API returned, such as an upload location.
 *
 * Such a URL is data, not a trusted value: it must use HTTPS, carry no
 * credentials, and must not point at a loopback, private, link-local or cloud
 * metadata address. The caller attaches no credential to it and follows no
 * redirect from it.
 */
export function assertSafeProviderUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkedInMcpError("LinkedIn returned a URL that is not valid.", 502);
  }
  if (!plainHttps(url)) throw new LinkedInMcpError("LinkedIn returned a URL that is not plain HTTPS.", 502);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
    host === "metadata" || host.startsWith("[") || host.includes(":") || privateIpv4(host)
  ) {
    throw new LinkedInMcpError("LinkedIn returned a URL that points at a private or local address.", 502);
  }
  return url;
}

export type HttpResult = { status: number; headers: Headers; text: string };

export type HttpRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string | URLSearchParams | Uint8Array;
  timeoutMs: number;
  maxBytes: number;
};

/** Sends one request to a fixed LinkedIn endpoint and reads a bounded answer. */
export async function sendRequest(target: string, request: HttpRequest): Promise<HttpResult> {
  const url = new URL(target);
  const destination = assertAllowedDestination(url);
  if (destination === "upload") assertSafeProviderUrl(target);
  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch {
    throw new LinkedInTransportError(
      "The LinkedIn request did not complete: network failure, timeout or a redirect, which is never followed.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return { status: response.status, headers: response.headers, text: "" };
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > request.maxBytes) {
        await reader.cancel();
        throw new LinkedInMcpError(
          `The LinkedIn response exceeded ${Math.round(request.maxBytes / 1024)} KiB. Narrow the date range, the fields or the page size.`,
          413,
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof LinkedInMcpError) throw error;
    throw new LinkedInTransportError("The LinkedIn response was interrupted before it was complete.");
  }
  return { status: response.status, headers: response.headers, text };
}

/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { LinkedInMcpError } from "../../core/errors.js";
import type { NativeObject } from "./transport.js";

/**
 * Upload receipts.
 *
 * Initializing an upload returns LinkedIn's signed upload URLs. They travel
 * back to this server inside an HMAC-signed receipt, so a model cannot swap in
 * a URL of its choice or mix the parts of two uploads. The signing key is
 * generated at startup and kept in memory: receipts stop being valid when the
 * server restarts, and after one hour at most.
 */
export function signReceipt(key: Buffer, payload: NativeObject): string {
  const text = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(text).digest("base64url");
  return `${text}.${signature}`;
}

export function verifyReceipt(key: Buffer, receipt: string, adAccountId: string): NativeObject {
  const [text, signature, extra] = receipt.split(".");
  if (!text || !signature || extra !== undefined) throw new LinkedInMcpError("Invalid upload receipt.", 400);
  const expected = createHmac("sha256", key).update(text).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new LinkedInMcpError("Invalid upload receipt. Receipts are only valid on the server process that issued them.", 400);
  }
  let payload: NativeObject;
  try {
    payload = JSON.parse(Buffer.from(text, "base64url").toString("utf8")) as NativeObject;
  } catch {
    throw new LinkedInMcpError("Invalid upload receipt.", 400);
  }
  if (payload.accountId !== adAccountId || typeof payload.expires !== "number" || payload.expires < Date.now()) {
    throw new LinkedInMcpError("Upload receipt expired or issued for another ad account. Initialize the upload again.", 400);
  }
  return payload;
}

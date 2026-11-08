/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { registerLinkedInAccountTools } from "./account-tools.js";
import type { Collector, LinkedInContext } from "./context.js";
import { registerLinkedInResources } from "./resources.js";
import { registerLinkedInTools } from "./tools.js";
import { registerLinkedInWrites } from "./writes.js";

/** Registers the read tools and resources, and the write tools only when writes are enabled. */
export function registerLinkedIn(c: Collector, ctx: LinkedInContext): void {
  registerLinkedInTools(c, ctx);
  registerLinkedInAccountTools(c, ctx);
  registerLinkedInResources(c, ctx);
  if (ctx.config.enableWrites) registerLinkedInWrites(c, ctx);
}

export { createContext } from "./context.js";
export type { Collector, LinkedInContext } from "./context.js";

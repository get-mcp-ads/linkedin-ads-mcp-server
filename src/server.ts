/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateConfig, type LinkedInConfigInput } from "./config.js";
import { logger } from "./core/logger.js";
import { createContext, registerLinkedIn } from "./platforms/linkedin/index.js";
import { collectorFor } from "./tool-quality.js";

export const PACKAGE_VERSION = "1.0.1";

export function createServer(input: LinkedInConfigInput): McpServer {
  const config = validateConfig(input);
  logger.setLevel(config.logLevel);
  const server = new McpServer(
    {
      name: "linkedin-ads-mcp",
      version: PACKAGE_VERSION,
      title: "LinkedIn Ads",
      websiteUrl: "https://www.getmcpads.com/tools/linkedin-ads",
      icons: [{ src: "https://mcp.getmcpads.com/icon.svg", mimeType: "image/svg+xml" }],
    },
    { capabilities: { tools: {}, resources: {} } },
  );
  registerLinkedIn(collectorFor(server), createContext(config));
  logger.system(
    `linkedin-ads-mcp v${PACKAGE_VERSION} ready for ${config.allowedAccountIds.length} ad account(s), writes ${config.enableWrites ? "enabled" : "disabled"}`,
  );
  return server;
}

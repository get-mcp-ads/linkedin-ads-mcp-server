/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
export { createServer, PACKAGE_VERSION } from "./server.js";
export { loadConfig, validateConfig, LINKEDIN_DEFAULT_VERSION } from "./config.js";
export type { LinkedInConfig, LinkedInConfigInput } from "./config.js";
export { nodeRuntimeWarning } from "./runtime-check.js";

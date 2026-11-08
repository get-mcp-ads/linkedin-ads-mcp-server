#!/usr/bin/env node
/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * stdout carries the MCP protocol, so every diagnostic goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { logger } from "./core/logger.js";
import { nodeRuntimeWarning } from "./runtime-check.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const warning = nodeRuntimeWarning();
  if (warning) process.stderr.write(`[linkedin-ads-mcp] WARN runtime: ${warning}\n`);
  try {
    const config = loadConfig();
    logger.setLevel(config.logLevel);
    await createServer(config).connect(new StdioServerTransport());
    logger.system("Stdio transport connected");
  } catch (error) {
    logger.error("cli", error instanceof Error ? error.message : "LinkedIn Ads server failed to start.");
    process.exitCode = 1;
  }
}

void main();

/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Logs go to stderr only: stdout carries the MCP protocol. No credential is
 * ever passed to the logger.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

class Logger {
  private level: LogLevel = "info";

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(scope: string, message: string): void {
    this.log("debug", scope, message);
  }

  info(scope: string, message: string): void {
    this.log("info", scope, message);
  }

  warn(scope: string, message: string): void {
    this.log("warn", scope, message);
  }

  error(scope: string, message: string): void {
    this.log("error", scope, message);
  }

  system(message: string): void {
    this.info("system", message);
  }

  private log(level: LogLevel, scope: string, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    console.error(`[linkedin-ads-mcp] ${level.toUpperCase()} ${scope}: ${message}`);
  }
}

export const logger = new Logger();

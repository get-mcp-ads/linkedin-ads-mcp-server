/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResourceResult, ToolResult, ToolShape } from "./platforms/linkedin/context.js";

/**
 * A stable structured envelope for heterogeneous provider responses. The
 * original MCP content remains unchanged; provider fields stay open because
 * reports return the fields that were asked for.
 */
export const RESULT_DESCRIPTION =
  "Original tool result: parsed JSON when the text is JSON, otherwise the text. Provider fields depend on the selected query.";

export type ToolAnnotations = {
  title?: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export function toolAnnotations(write: boolean): ToolAnnotations {
  // Conservative for writes: an update can replace existing data, and a
  // creation or upload must never be blindly retried after an uncertain reply.
  return { readOnlyHint: !write, destructiveHint: write, idempotentHint: !write, openWorldHint: true };
}

export function structuredResult<T extends { content: unknown[]; isError?: boolean; structuredContent?: Record<string, unknown> }>(value: T): T {
  if (value.isError) return value;
  let result: unknown = value.content;
  const first = value.content[0] as { type?: string; text?: string } | undefined;
  if (value.content.length === 1 && first?.type === "text" && typeof first.text === "string") {
    result = first.text;
    try {
      result = JSON.parse(first.text);
    } catch {
      /* Plain text is valid. */
    }
  }
  return { ...value, structuredContent: { ...value.structuredContent, result } };
}

const resultShape = {
  result: z
    .union([z.object({}).passthrough(), z.array(z.unknown()), z.string(), z.number(), z.boolean(), z.null()])
    .describe(RESULT_DESCRIPTION),
};

/**
 * Adapts the registrations to the SDK's registerTool API with annotations,
 * titles and an output schema. A tool is a write when its input has `confirm`.
 * Building this catalogue needs no credential and runs no tool.
 */
export function collectorFor(server: McpServer) {
  return {
    tool(name: string, description: string, shape: ToolShape, handler: (args: Record<string, unknown>) => Promise<ToolResult>) {
      const write = Object.hasOwn(shape, "confirm");
      server.registerTool(
        name,
        { title: name.replace(/_/g, " "), description, inputSchema: shape, outputSchema: resultShape, annotations: toolAnnotations(write) },
        async (args: Record<string, unknown>) => structuredResult(await handler(args)) as never,
      );
    },
    resource(name: string, uri: string, read: () => Promise<ResourceResult>) {
      server.registerResource(name, uri, { mimeType: "application/json" }, async () => read());
    },
  };
}

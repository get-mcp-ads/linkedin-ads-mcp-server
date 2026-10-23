import { validateConfig, type LinkedInConfigInput } from "../../src/config.js";
import { createContext, registerLinkedIn } from "../../src/platforms/linkedin/index.js";
import type { ToolResult } from "../../src/platforms/linkedin/context.js";

export type CollectedTool = {
  name: string;
  description: string;
  shape: Record<string, any>;
  write: boolean;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export const ACCOUNT = "1";
export const TOKEN = "private-access-token";

export function collect(overrides: Partial<LinkedInConfigInput> = {}) {
  const config = validateConfig({ accessToken: TOKEN, allowedAccountIds: [ACCOUNT], enableWrites: true, logLevel: "error", ...overrides });
  const ctx = createContext(config, { sleep: async () => undefined });
  const tools: CollectedTool[] = [];
  const resources: { name: string; uri: string; read: () => Promise<any> }[] = [];
  registerLinkedIn(
    {
      tool(name, description, shape, handler) {
        tools.push({ name, description, shape, handler, write: Object.hasOwn(shape, "confirm") });
      },
      resource(name, uri, read) {
        resources.push({ name, uri, read });
      },
    },
    ctx,
  );
  const call = async (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`No tool ${name}`);
    const result = await tool.handler(args);
    return { result, data: JSON.parse(result.content[0]!.text) };
  };
  return { tools, resources, call, ctx };
}

export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });

/** The request of a mocked fetch call, whatever form the URL took. */
export const requestOf = (call: unknown[]) => ({ url: String(call[0]), init: (call[1] ?? {}) as RequestInit });

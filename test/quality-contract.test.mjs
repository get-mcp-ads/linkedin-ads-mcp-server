import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const fixture = { accessToken: "metadata-fixture", allowedAccountIds: ["100000001"], logLevel: "error" };

async function connect(enableWrites, callback) {
  const server = createServer({ ...fixture, enableWrites });
  const client = new Client({ name: "quality-contract", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    await callback(client, server);
  } finally {
    await client.close();
    await server.close();
  }
}

test("metadata is complete over MCP; write tools require explicit opt-in", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Metadata must not access a provider");
  };
  try {
    for (const enabled of [false, true]) {
      await connect(enabled, async (client) => {
        const tools = (await client.listTools()).tools;
        assert.equal(new Set(tools.map((t) => t.name)).size, tools.length, "duplicate tools");
        assert.ok(tools.every((t) => t.name.startsWith("linkedin_")), "every tool keeps the linkedin_ prefix");
        for (const tool of tools) {
          assert.ok(tool.description.length > 20, tool.name);
          assert.ok(tool.outputSchema?.required.includes("result"), tool.name);
          assert.equal(typeof tool.annotations?.readOnlyHint, "boolean", tool.name);
          if (!enabled) assert.equal(tool.annotations.readOnlyHint, true, tool.name);
          if (!tool.annotations.readOnlyHint) {
            assert.ok(tool.inputSchema.properties.confirm, tool.name);
            assert.equal(tool.inputSchema.properties.confirm.default, false, `${tool.name} must preview by default`);
            assert.equal(tool.annotations.idempotentHint, false, tool.name);
          } else {
            assert.equal(tool.inputSchema.properties?.confirm, undefined, `${tool.name} is read-only and takes no confirm`);
          }
          for (const [key, schema] of Object.entries(tool.inputSchema.properties || {})) assert.ok(schema.description, `${tool.name}.${key}`);
        }
        assert.equal(tools.some((t) => !t.annotations.readOnlyHint), enabled);
        assert.equal(client.getServerVersion().websiteUrl, pkg.homepage);
        assert.equal(client.getServerVersion().version, pkg.version);
      });
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("structured output carries parsed JSON results and leaves errors unstructured", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("This test must not access a provider");
  };
  try {
    await connect(false, async (client) => {
      const valid = await client.callTool({ name: "linkedin_validate_query", arguments: { pivots: ["CAMPAIGN"], metrics: ["ctr"] } });
      assert.equal(valid.isError, undefined);
      assert.equal(valid.structuredContent.result.valid, true);
      assert.deepEqual(JSON.parse(valid.content[0].text), valid.structuredContent.result);
      const refused = await client.callTool({ name: "linkedin_get_account_details", arguments: { adAccountId: "999" } });
      assert.equal(refused.isError, true);
      assert.equal(refused.structuredContent, undefined);
      assert.match(refused.content[0].text, /LINKEDIN_ADS_ACCOUNT_IDS/);
    });
  } finally {
    globalThis.fetch = original;
  }
});

/**
 * The README documents every tool and resource by name. A tool renamed in the
 * code and not in the README is a documentation bug, and this test fails on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const READS = 18;
const WRITES = 15;
const RESOURCES = 6;

async function introspect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js"],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => typeof value === "string" && !key.startsWith("LINKEDIN_ADS_"))),
      LINKEDIN_ADS_ACCESS_TOKEN: "token-for-listing",
      LINKEDIN_ADS_ACCOUNT_IDS: "100000001",
      LINKEDIN_ADS_ENABLE_WRITES: "true",
      LINKEDIN_ADS_LOG_LEVEL: "error",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "readme-check", version: "1" }, { capabilities: {} });
  await client.connect(transport);
  const definitions = (await client.listTools()).tools;
  const tools = definitions.map((t) => t.name);
  const resources = (await client.listResources()).resources.map((r) => r.uri);
  await client.close();
  return { tools, resources, definitions };
}

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const surface = introspect();

test("README documents every tool the server exposes, and no other", async () => {
  const { tools } = await surface;
  const cited = new Set([...README.matchAll(/`(linkedin_[a-z_]+)`/g)].map((m) => m[1]));
  const undocumented = tools.filter((t) => !cited.has(t));
  assert.deepEqual(undocumented, [], `Tools missing from README: ${undocumented.join(", ")}`);
  const invented = [...cited].filter((c) => !tools.includes(c));
  assert.deepEqual(invented, [], `README cites tools that do not exist: ${invented.join(", ")}`);
});

test("README documents every resource the server exposes, and no other", async () => {
  const { resources } = await surface;
  const cited = new Set([...README.matchAll(/`(linkedin:\/\/[a-z0-9-]+)`/g)].map((m) => m[1]));
  const undocumented = resources.filter((r) => !cited.has(r));
  assert.deepEqual(undocumented, [], `Resources missing from README: ${undocumented.join(", ")}`);
  const invented = [...cited].filter((c) => !resources.includes(c));
  assert.deepEqual(invented, [], `README cites resources that do not exist: ${invented.join(", ")}`);
});

test("README counts match the code", async () => {
  const { tools, resources, definitions } = await surface;
  const writes = definitions.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
  const reads = tools.filter((t) => !writes.includes(t));
  assert.equal(reads.length, READS, "read tool count changed, update the README");
  assert.equal(writes.length, WRITES, "write tool count changed, update the README");
  assert.equal(resources.length, RESOURCES, "resource count changed, update the README");
  assert.match(README, new RegExp(`\\*\\*${reads.length} read tools\\*\\* · \\*\\*${writes.length} write tools\\*\\*, disabled by default\\.`));
  assert.match(README, new RegExp(`<b>${reads.length} read tools</b>`));
  assert.match(README, new RegExp(`<b>${writes.length} write tools</b>`));
  assert.match(README, new RegExp(`<b>${resources.length} resources</b>`));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.description.includes(`${reads.length} read tools`) && pkg.description.includes(`${writes.length} `), "package.json description counts");
});

test("README documents every environment variable declared for the registry", () => {
  const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
  const declared = server.packages.flatMap((p) => p.environmentVariables ?? []).map((v) => v.name);
  const missing = declared.filter((name) => !README.includes(`\`${name}\``));
  assert.deepEqual(missing, [], `Environment variables missing from README: ${missing.join(", ")}`);
});

test("published prose uses no em dashes", () => {
  const files = ["README.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "CHANGELOG.md", "RELEASING.md", "SOURCE_SYNC.md", "NOTICE", ".env.example", "server.json", "package.json"];
  const walk = (dir, acc = []) => {
    for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, acc);
      else if (entry.name.endsWith(".ts")) acc.push(`${dir}/${entry.name}`);
    }
    return acc;
  };
  const offenders = [];
  for (const file of [...files, ...walk("src")]) {
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.includes("—")) offenders.push(`${file}:${i + 1}`);
      });
  }
  assert.deepEqual(offenders, [], `Em dashes are not used in this project. Rewrite the sentence instead of swapping the character. Found at: ${offenders.join(", ")}`);
});

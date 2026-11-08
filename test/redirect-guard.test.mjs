/**
 * Every outbound call carries a bearer token or a client secret, except the
 * signed upload request. Following a redirect would forward a credential to
 * whatever host the redirect names, so no fetch in this codebase may omit
 * `redirect: "error"`, and no host outside LinkedIn's may appear in the source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

function sourceFiles(dir = "src", acc = []) {
  for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(`${dir}/${entry.name}`, acc);
    else if (entry.name.endsWith(".ts")) acc.push(`${dir}/${entry.name}`);
  }
  return acc;
}

test("every fetch refuses to follow redirects", () => {
  const offenders = [];
  let calls = 0;
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    let index = text.indexOf("fetch(");
    while (index !== -1) {
      calls += 1;
      // The options object of a fetch call ends at the first `});` that follows.
      const tail = text.slice(index, index + 1200);
      const end = tail.indexOf("});");
      const call = end === -1 ? tail : tail.slice(0, end);
      if (!call.includes('redirect: "error"')) offenders.push(`${file}:${text.slice(0, index).split("\n").length}`);
      index = text.indexOf("fetch(", index + 1);
    }
  }
  assert.ok(calls > 0, "the scan found no fetch call at all");
  assert.deepEqual(offenders, [], `These fetch calls may follow a redirect and leak credentials: ${offenders.join(", ")}`);
});

test("network access goes through the single guarded request function", () => {
  const callers = sourceFiles().filter((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").includes("fetch("));
  assert.deepEqual(callers, ["src/core/http.ts"]);
});

test("the only hosts this server can reach are LinkedIn's", () => {
  const hosts = new Set();
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].replace(/\.$/, "").toLowerCase();
      // Identity links in headers and the server icon are not call targets.
      if (host === "mcp.getmcpads.com" || host === "www.getmcpads.com") continue;
      hosts.add(host);
    }
  }
  assert.deepEqual([...hosts].sort(), ["api.linkedin.com", "www.linkedin.com"], "A new outbound host appeared. That is a deliberate decision, not an accident.");
});

test("stdout stays reserved for the MCP protocol", () => {
  const offenders = sourceFiles().filter((file) => /console\.log|process\.stdout\.write/.test(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")));
  assert.deepEqual(offenders, []);
});

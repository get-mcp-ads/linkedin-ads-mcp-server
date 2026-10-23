import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LINKEDIN_ADS_")));
  return spawnSync(process.execPath, ["dist/cli.js"], { env: { ...clean, ...env }, input: "", encoding: "utf8", timeout: 15000 });
}

test("a missing configuration fails on stderr with an actionable message and nothing on stdout", () => {
  const result = run({ LINKEDIN_ADS_ACCESS_TOKEN: "private-cli-token" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /LINKEDIN_ADS_ACCOUNT_IDS/);
  assert.doesNotMatch(result.stderr, /private-cli-token/);
});

test("an ambiguous write flag refuses to start", () => {
  const result = run({ LINKEDIN_ADS_ACCESS_TOKEN: "fixture", LINKEDIN_ADS_ACCOUNT_IDS: "1", LINKEDIN_ADS_ENABLE_WRITES: "1" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /exactly true or false/);
});

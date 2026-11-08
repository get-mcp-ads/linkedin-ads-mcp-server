import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, validateConfig } from "../src/config.ts";

const secret = "private-token-value";

test("invalid or empty configuration cannot start unscoped access or reveal its token", () => {
  for (const value of [
    {},
    { accessToken: secret },
    { accessToken: secret, allowedAccountIds: [] },
    { accessToken: secret, allowedAccountIds: ["../other"] },
    { accessToken: secret, allowedAccountIds: ["1"], apiVersion: "2026-08" },
    { refreshToken: secret, allowedAccountIds: ["1"] },
    { accessToken: secret, refreshToken: secret, allowedAccountIds: ["1"] },
    { accessToken: secret, allowedAccountIds: ["1"], unknownOption: true },
  ]) {
    assert.throws(() => validateConfig(value), (error) => !error.message.includes(secret) && /LINKEDIN_ADS_/.test(error.message));
  }
  const config = validateConfig({ accessToken: "fixture", allowedAccountIds: ["1", "1", "2"] });
  assert.equal(config.enableWrites, false);
  assert.equal(config.apiVersion, "202608");
  assert.deepEqual(config.allowedAccountIds, ["1", "2"]);
});

function withEnv(env, fn) {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) if (key.startsWith("LINKEDIN_ADS_")) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

test("environment variables map to the configuration", () => {
  const config = withEnv(
    {
      LINKEDIN_ADS_ACCESS_TOKEN: "fixture",
      LINKEDIN_ADS_ACCOUNT_IDS: "512352200, urn:li:sponsoredAccount:512352201",
      LINKEDIN_ADS_SCOPES: "r_ads r_ads_reporting,rw_ads",
      LINKEDIN_ADS_ENABLE_WRITES: "true",
      LINKEDIN_ADS_API_VERSION: "202610",
    },
    loadConfig,
  );
  assert.deepEqual(config.allowedAccountIds, ["512352200", "512352201"]);
  assert.deepEqual(config.scopes, ["r_ads", "r_ads_reporting", "rw_ads"]);
  assert.equal(config.enableWrites, true);
  assert.equal(config.apiVersion, "202610");
});

test("writes need the exact value true", () => {
  for (const value of ["1", "yes", "TRUE", "on"]) {
    assert.throws(
      () => withEnv({ LINKEDIN_ADS_ACCESS_TOKEN: "fixture", LINKEDIN_ADS_ACCOUNT_IDS: "1", LINKEDIN_ADS_ENABLE_WRITES: value }, loadConfig),
      /exactly true or false/,
    );
  }
  assert.equal(withEnv({ LINKEDIN_ADS_ACCESS_TOKEN: "fixture", LINKEDIN_ADS_ACCOUNT_IDS: "1" }, loadConfig).enableWrites, false);
});

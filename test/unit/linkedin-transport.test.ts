import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAllowedDestination, assertSafeProviderUrl, sendRequest } from "../../src/core/http.js";
import { collect, json, requestOf, TOKEN } from "./catalogue.js";

afterEach(() => vi.unstubAllGlobals());

const refreshConfig = { accessToken: undefined, refreshToken: "private-refresh-token", clientId: "client-id", clientSecret: "private-client-secret" };

describe("reads retry, writes do not", () => {
  it("retries a throttled read and honours Retry-After", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "Too many requests" }, 429, { "retry-after": "1" }))
      .mockResolvedValueOnce(json({ message: "busy" }, 503))
      .mockResolvedValueOnce(json({ id: 1, name: "Account" }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(result.isError).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("gives up after two read retries with an actionable 429 message", async () => {
    const fetcher = vi.fn(async () => json({ message: "Too many requests" }, 429));
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(data.error).toContain("45 million metric values");
  });

  it("sends every request without following redirects, with a timeout", async () => {
    const fetcher = vi.fn(async () => json({ id: 1 }));
    vi.stubGlobal("fetch", fetcher);
    await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    const { init } = requestOf(fetcher.mock.calls[0]!);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("refuses an oversized response", async () => {
    const big = "x".repeat(17 * 1024 * 1024);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(big)));
    const { data } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(data.error).toContain("exceeded");
  });
});

describe("token refresh in memory", () => {
  it("obtains a token with the refresh credentials and never returns them", async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.href === "https://www.linkedin.com/oauth/v2/accessToken") {
        expect(init.redirect).toBe("error");
        expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
          grant_type: "refresh_token",
          refresh_token: "private-refresh-token",
          client_id: "client-id",
          client_secret: "private-client-secret",
        });
        return json({ access_token: "fresh-access-token", expires_in: 5_184_000 });
      }
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fresh-access-token");
      return json({ message: "echo fresh-access-token private-client-secret" }, 400);
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect(refreshConfig).call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    const text = JSON.stringify(result);
    expect(text).not.toContain("fresh-access-token");
    expect(text).not.toContain("private-client-secret");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("renews once after a 401 on a read", async () => {
    let issued = 0;
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.hostname === "www.linkedin.com") return json({ access_token: `token-number-${++issued}`, expires_in: 3600 });
      return (init.headers as Record<string, string>).Authorization === "Bearer token-number-1" ? json({ message: "expired" }, 401) : json({ id: 1 });
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect(refreshConfig).call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(result.isError).toBeUndefined();
    expect(issued).toBe(2);
  });

  it("does not relay a refused refresh payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_request", error_description: "token private-refresh-token revoked" }, 400)));
    const { result, data } = await collect(refreshConfig).call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(data.error).toContain("HTTP 400 (invalid_request)");
    expect(JSON.stringify(result)).not.toContain("private-refresh-token");
  });

  it("asks for a new token when no refresh credentials exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Invalid access token" }, 401)));
    const { data } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(data.statusCode).toBe(401);
    expect(data.error).toContain("LINKEDIN_ADS_ACCESS_TOKEN");
  });
});

describe("network allowlist", () => {
  it.each([
    "https://evil.test/rest/adAccounts",
    "http://api.linkedin.com/rest/adAccounts",
    "https://api.linkedin.com:8443/rest/adAccounts",
    "https://user:pass@api.linkedin.com/rest/adAccounts",
    "https://www.linkedin.com/feed/",
    "https://api.linkedin.com/v2/me",
  ])("refuses %s", (url) => {
    expect(() => assertAllowedDestination(new URL(url))).toThrow("outside the LinkedIn");
  });

  it.each(["https://127.0.0.1/x", "https://169.254.169.254/latest", "https://10.0.0.8/", "https://[::1]/", "http://media.licdn.com/a", "https://metadata.google.internal/"])(
    "refuses the provider URL %s",
    (url) => {
      expect(() => assertSafeProviderUrl(url)).toThrow();
    },
  );

  it("refuses a destination before any network call", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(sendRequest("https://evil.test/", { method: "GET", timeoutMs: 1000, maxBytes: 1000 })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["/adAccounts/../posts", "/adAccounts/%2e%2e/posts", "/adAccounts/1#x", "/organizations/1", "//evil.test"])("blocks the API path %s", async (path) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { ctx } = collect();
    const { LinkedInTransport } = await import("../../src/platforms/linkedin/transport.js");
    await expect(new LinkedInTransport(ctx.auth, "202608").call("GET", path)).rejects.toThrow("Refused a LinkedIn API path");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

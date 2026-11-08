import { afterEach, describe, expect, it, vi } from "vitest";
import { collect, json, requestOf, TOKEN } from "./catalogue.js";

afterEach(() => vi.unstubAllGlobals());

describe("account allowlist", () => {
  it("rejects an unconfigured account before any request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { call } = collect();
    for (const [name, args] of [
      ["linkedin_get_account_details", { adAccountId: "2" }],
      ["linkedin_get_insights", { adAccountId: "2", startDate: "2026-09-01" }],
      ["linkedin_get_revenue_attribution", { adAccountId: "2", startDate: "2026-08-01", endDate: "2026-08-31" }],
      ["linkedin_health_check", { adAccountId: "2" }],
      ["linkedin_list_ad_accounts", { adAccountIds: ["1", "2"] }],
      ["linkedin_create_campaign_group", { adAccountId: "2", name: "Draft", runSchedule: { start: 2000000000000 }, confirm: true }],
    ] as const) {
      const { result, data } = await call(name, args);
      expect(result.isError, name).toBe(true);
      expect(data.error, name).toContain("LINKEDIN_ADS_ACCOUNT_IDS");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lists configured accounts only, even when LinkedIn returns more", async () => {
    const fetcher = vi.fn(async () =>
      json({ elements: [{ id: 1, name: "Allowed", currency: "EUR" }, { id: 3, name: "Private other account" }, { id: 4, name: "Test", test: true }] }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect({ allowedAccountIds: ["1", "4"] }).call("linkedin_list_ad_accounts", {});
    expect(data.accounts.map((a: any) => a.id)).toEqual([1]);
    expect(data.hiddenTestAccounts).toBe(1);
    expect(JSON.stringify(data)).not.toContain("Private other account");
    expect(String(fetcher.mock.calls[0]![0])).toContain("search=(id:(values:List(1,4)))");
  });

  it("stops on a repeated account pagination token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ elements: [], metadata: { nextPageToken: "same" } })));
    const { result, data } = await collect().call("linkedin_list_ad_accounts", {});
    expect(result.isError).toBe(true);
    expect(data.error).toContain("repeated a pagination token");
  });

  it("does not expose a tool without an account scope, except discovery and local validation", () => {
    const { tools } = collect();
    const unscoped = tools.filter((t) => !t.shape.adAccountId || t.shape.adAccountId.isOptional()).map((t) => t.name);
    expect(unscoped.sort()).toEqual(["linkedin_health_check", "linkedin_list_ad_accounts", "linkedin_validate_query"]);
  });

  it("checks child filters before an analytics request", async () => {
    const fetcher = vi.fn(async () => json({ account: "urn:li:sponsoredAccount:2" }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_get_insights", { adAccountId: "1", campaignIds: ["9"], startDate: "2026-09-01" });
    expect(result.isError).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).not.toContain("adAnalytics");
  });

  it("keeps revenue attribution scoped to the selected account", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/rest/adAnalytics");
      expect(url.searchParams.get("account")).toBe("urn:li:sponsoredAccount:1");
      return json({ elements: [{ pivotValues: ["urn:li:sponsoredCampaign:9"], revenueAttributionMetrics: { revenueWonInUsd: 123 } }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_get_revenue_attribution", { adAccountId: "1", startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(result.isError).toBeUndefined();
    expect(data.rows[0].revenueAttributionMetrics.revenueWonInUsd).toBe(123);
  });
});

describe("native routes", () => {
  it("reads numeric ad IDs using LinkedIn's native creative URN key", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.href).toBe("https://api.linkedin.com/rest/adAccounts/1/creatives/urn%3Ali%3AsponsoredCreative%3A9");
      return json({ id: "urn:li:sponsoredCreative:9", account: "urn:li:sponsoredAccount:1" });
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_get_entity", { adAccountId: "1", kind: "creatives", entityId: "9" });
    expect(result.isError).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses an entity of another account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: 7, account: "urn:li:sponsoredAccount:2" })));
    const { result, data } = await collect().call("linkedin_get_entity", { adAccountId: "1", kind: "adCampaigns", entityId: "7" });
    expect(result.isError).toBe(true);
    expect(data.error).toContain("another ad account");
  });

  it("does not read media outside the account library", async () => {
    const fetcher = vi.fn(async () => json({ elements: [], paging: {} }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_get_media", { adAccountId: "1", mediaId: "urn:li:video:other" });
    expect(result.isError).toBe(true);
    expect(String(fetcher.mock.calls[0]![0])).toContain("associatedAccount=urn%3Ali%3AsponsoredAccount%3A1");
  });

  it("does not follow native pagination URLs into another host", async () => {
    const fetcher = vi.fn(async () => json({ elements: [], paging: { links: [{ rel: "next", href: "https://evil.test/" }] } }));
    vi.stubGlobal("fetch", fetcher);
    await collect().call("linkedin_get_media", { adAccountId: "1", mediaId: "urn:li:image:missing" });
    expect(fetcher.mock.calls.length).toBe(10);
    expect(fetcher.mock.calls.every((c) => String(c[0]).startsWith("https://api.linkedin.com/rest/images?"))).toBe(true);
  });

  it("keeps library URLs and actual ad names separate from the landing page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        const href = url.href;
        if (href.includes("/creatives?"))
          return json({
            elements: [{ id: "urn:li:sponsoredCreative:9", account: "urn:li:sponsoredAccount:1", name: "Real Ad Name", content: { reference: "urn:li:share:8" } }],
            metadata: { nextPageToken: "next" },
          });
        if (href.includes("/posts/")) return json({ content: { media: { id: "urn:li:video:vid" } }, contentLandingPage: "https://example.com" });
        return json({
          elements: [
            {
              id: "urn:li:video:vid",
              mediaLibraryMetadata: { associatedAccount: "urn:li:sponsoredAccount:1", assetName: "upload.mp4" },
              downloadUrl: "https://dms.licdn.com/file.mp4",
              thumbnail: "https://media.licdn.com/cover.jpg",
              status: "AVAILABLE",
            },
          ],
        });
      }),
    );
    const { data } = await collect().call("linkedin_list_ad_creatives", { adAccountId: "1" });
    expect(data.assets[0]).toMatchObject({
      name: "Real Ad Name",
      assetName: "upload.mp4",
      video: "https://dms.licdn.com/file.mp4",
      link: "https://dms.licdn.com/file.mp4",
      landingPageUrl: "https://example.com",
    });
    expect(data.coverage.partial).toBe(true);
  });

  it("drops a media URL outside the LinkedIn media CDN instead of returning it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          elements: [
            { id: "urn:li:image:a", mediaLibraryMetadata: { associatedAccount: "urn:li:sponsoredAccount:1" }, downloadUrl: "http://169.254.169.254/latest", status: "AVAILABLE" },
          ],
        }),
      ),
    );
    const { data } = await collect().call("linkedin_list_media", { adAccountId: "1", kind: "images" });
    expect(data.assets[0].assetUrl).toBeNull();
  });
});

describe("provider errors", () => {
  it("maps a 403 to an actionable explanation and redacts the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: `Not enough permissions for Bearer ${TOKEN}`, serviceErrorCode: 100 }, 403)));
    const { result, data } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(result.isError).toBe(true);
    expect(data.statusCode).toBe(403);
    expect(data.serviceErrorCode).toBe(100);
    expect(data.error).toContain("r_ads_reporting or rw_ads");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("keeps native error details for diagnosing parameters", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Invalid param", errorDetails: { inputErrors: [{ code: "INVALID_CONTENT_OWNERSHIP" }] } }, 400)));
    const { data } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(data.error).toContain("INVALID_CONTENT_OWNERSHIP");
  });

  it("explains a refused API version", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Requested version 202001 is not active" }, 426)));
    const { data } = await collect().call("linkedin_get_account_details", { adAccountId: "1", includeUsers: false });
    expect(data.error).toContain("LINKEDIN_ADS_API_VERSION");
  });

  it("reports a health check without any token", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      url.pathname === "/rest/adAccounts" ? json({ elements: [{ id: 1, name: "Allowed", currency: "EUR" }] }) : json({ elements: [] }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect({ allowedAccountIds: ["1", "5"] }).call("linkedin_health_check", {});
    expect(data.status).toBe("warning");
    expect(data.checks.find((c: any) => c.name === "configured_accounts").detail).toContain("Not reachable: 5");
    expect(JSON.stringify(data)).not.toContain(TOKEN);
  });
});

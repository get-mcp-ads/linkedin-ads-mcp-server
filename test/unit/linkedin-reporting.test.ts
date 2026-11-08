import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCalculated } from "../../src/platforms/linkedin/calculated-metrics.js";
import { LINKEDIN_METRIC_CATALOG } from "../../src/platforms/linkedin/catalog/metrics.js";
import { dateRange, plainList, urnList } from "../../src/platforms/linkedin/client.js";
import { planQuery } from "../../src/platforms/linkedin/query-planner.js";
import { collect, json, requestOf } from "./catalogue.js";

afterEach(() => vi.unstubAllGlobals());

/**
 * LinkedIn expects Rest.li in its query string: parentheses, commas and colons
 * are syntax, and only URNs are encoded. Encoding everything answers "Invalid
 * query parameters passed to request", and encoding nothing breaks the first URN.
 */
describe("Rest.li encoding", () => {
  it("keeps the syntax and encodes only URNs", () => {
    expect(plainList(["ACTIVE", "PAUSED"])).toBe("List(ACTIVE,PAUSED)");
    expect(urnList(["urn:li:sponsoredAccount:1"])).toBe("List(urn%3Ali%3AsponsoredAccount%3A1)");
  });

  it("writes a date range as three integers, not an ISO string", () => {
    expect(dateRange({ start: { year: 2026, month: 1, day: 5 } })).toBe("(start:(year:2026,month:1,day:5))");
    expect(dateRange({ start: { year: 2026, month: 1, day: 5 }, end: { year: 2026, month: 2, day: 1 } })).toBe(
      "(start:(year:2026,month:1,day:5),end:(year:2026,month:2,day:1))",
    );
  });
});

describe("report planning", () => {
  it("turns calculated metrics into raw fields", () => {
    const plan = planQuery({ pivots: ["CAMPAIGN"], metrics: ["ctr", "cpc"], startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(plan.calculated).toEqual(["ctr", "cpc"]);
    expect(plan.fields).toEqual(expect.arrayContaining(["dateRange", "pivotValues", "clicks", "impressions", "costInLocalCurrency"]));
    expect(plan.fields).not.toContain("ctr");
  });

  it("applies the twenty field ceiling before the call", () => {
    const many = LINKEDIN_METRIC_CATALOG.filter((m) => m.type === "api" && !m.apiField.includes("."))
      .slice(0, 25)
      .map((m) => m.key);
    expect(() => planQuery({ pivots: ["CAMPAIGN"], metrics: many, startDate: "2026-01-01" })).toThrow(/at most 20 fields/);
  });

  it("refuses a metric the requested pivot does not return", () => {
    // LinkedIn drops the field instead of refusing the call, so the row would read as zero.
    expect(() =>
      planQuery({ pivots: ["MEMBER_SENIORITY"], metrics: ["conversionValueInLocalCurrency"], startDate: "2026-01-01" }),
    ).toThrow(/empty or misleading/);
  });

  it("refuses reach beyond the window where LinkedIn computes it", () => {
    expect(() =>
      planQuery({ pivots: ["CAMPAIGN"], metrics: ["approximateMemberReach"], startDate: "2025-01-01", endDate: "2026-01-01" }),
    ).toThrow(/92 days/);
  });

  it("refuses a date that is not one", () => {
    expect(() => planQuery({ pivots: ["CAMPAIGN"], metrics: ["clicks"], startDate: "01/01/2026" })).toThrow(/YYYY-MM-DD/);
  });

  it("keeps attribution metrics out of the standard report", () => {
    expect(() => planQuery({ pivots: ["CAMPAIGN"], metrics: ["revenueWonInUsd"], startDate: "2026-01-01" })).toThrow(
      /revenue attribution finder/,
    );
  });
});

describe("calculated metrics", () => {
  it("computes the ratios LinkedIn does not return", () => {
    const [row] = applyCalculated([{ impressions: 1000, clicks: 25, costInLocalCurrency: "50.5" }], ["ctr", "cpc", "cpm"]);
    expect(row!.ctr).toBeCloseTo(0.025, 6);
    expect(row!.cpc).toBeCloseTo(2.02, 6);
    expect(row!.cpm).toBeCloseTo(50.5, 6);
  });

  it("omits a ratio with a zero denominator instead of writing zero", () => {
    const [row] = applyCalculated([{ impressions: 1000, clicks: 0, costInLocalCurrency: "50" }], ["cpc", "ctr"]);
    expect(row!.cpc).toBeUndefined();
    expect(row!.ctr).toBe(0);
  });

  it("leaves rows untouched when nothing is requested", () => {
    const rows = [{ impressions: 1 }];
    expect(applyCalculated(rows, [])).toBe(rows);
  });
});

describe("catalog", () => {
  it("has no duplicate key", () => {
    const keys = LINKEDIN_METRIC_CATALOG.map((m) => m.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("gives every calculated metric a formula and its inputs", () => {
    for (const metric of LINKEDIN_METRIC_CATALOG.filter((m) => m.type === "calculated")) {
      expect(metric.formula, metric.key).toBeTruthy();
      expect(metric.dependencies?.length ?? 0, metric.key).toBeGreaterThan(0);
      expect(metric.apiField, metric.key).toBe("");
    }
  });
});

describe("reporting tools", () => {
  it("scopes every report on its account and computes ratios from the raw terms", async () => {
    const fetcher = vi.fn(async () => json({ elements: [{ pivotValues: ["urn:li:sponsoredCampaign:9"], impressions: 200, clicks: 4, costInLocalCurrency: "8.00" }] }));
    vi.stubGlobal("fetch", fetcher);
    const { call } = collect();
    const { result, data } = await call("linkedin_get_insights", { adAccountId: "1", startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(result.isError).toBeUndefined();
    const { url, init } = requestOf(fetcher.mock.calls[0]!);
    expect(url).toContain("https://api.linkedin.com/rest/adAnalytics?q=analytics");
    expect(url).toContain("accounts=List(urn%3Ali%3AsponsoredAccount%3A1)");
    expect(url).toContain("dateRange=(start:(year:2026,month:9,day:1),end:(year:2026,month:9,day:30))");
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>)["LinkedIn-Version"]).toBe("202608");
    expect(data.rows[0].ctr).toBeCloseTo(0.02, 6);
    expect(data.rows[0].cpc).toBeCloseTo(2, 6);
    expect(data.computedByServer).toEqual(["ctr", "cpc", "cpm"]);
  });

  it("explains an empty report instead of reading it as zero spend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ elements: [] })));
    const { data } = await collect().call("linkedin_get_insights", { adAccountId: "1", startDate: "2026-09-01" });
    expect(data.notes.join(" ")).toContain("linkedin_health_check");
  });

  it("validates a query locally without any request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_validate_query", { pivots: ["MEMBER_INDUSTRY"], metrics: ["conversionValueInLocalCurrency"] });
    expect(data.valid).toBe(false);
    expect(data.issues[0].field).toBe("conversionValueInLocalCurrency");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("follows the cursor of a campaign page and keeps the next token", async () => {
    const fetcher = vi.fn(async () => json({ elements: [{ id: 5, name: "Draft", status: "DRAFT" }], metadata: { nextPageToken: "abc" } }));
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_get_campaigns", { adAccountId: "1", pageToken: "prev", pageSize: 10 });
    expect(data.nextPageToken).toBe("abc");
    expect(String(fetcher.mock.calls[0]![0])).toContain("pageToken=prev");
    expect(String(fetcher.mock.calls[0]![0])).toContain("pageSize=10");
  });
});

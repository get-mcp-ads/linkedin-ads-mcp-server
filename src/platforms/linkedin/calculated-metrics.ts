import { LINKEDIN_CALCULATED_METRICS } from "./catalog/metrics.js";
import type { LinkedInAnalyticsRow } from "./types.js";

/**
 * The ratios LinkedIn does not expose.
 *
 * `adAnalytics` returns raw terms only: no CTR, CPC or CPM. Campaign Manager
 * shows them, the API does not. Computing them here avoids the classic mistake
 * of dividing rows already aggregated by a demographic pivot whose tail
 * LinkedIn has cut.
 */
const FORMULAS: Record<string, (row: Record<string, number>) => number | undefined> = {
  ctr: (r) => (r.impressions > 0 ? r.clicks / r.impressions : undefined),
  cpc: (r) => (r.clicks > 0 ? r.costInLocalCurrency / r.clicks : undefined),
  cpm: (r) => (r.impressions > 0 ? (r.costInLocalCurrency / r.impressions) * 1000 : undefined),
  cpl: (r) => (r.oneClickLeads > 0 ? r.costInLocalCurrency / r.oneClickLeads : undefined),
  cpa: (r) => (r.externalWebsiteConversions > 0 ? r.costInLocalCurrency / r.externalWebsiteConversions : undefined),
  conversionRate: (r) => (r.clicks > 0 ? r.externalWebsiteConversions / r.clicks : undefined),
  leadRate: (r) => (r.oneClickLeadFormOpens > 0 ? r.oneClickLeads / r.oneClickLeadFormOpens : undefined),
  engagementRate: (r) => (r.impressions > 0 ? r.totalEngagements / r.impressions : undefined),
  videoCompletionRate: (r) => (r.videoStarts > 0 ? r.videoCompletions / r.videoStarts : undefined),
  costPerVideoView: (r) => (r.videoViews > 0 ? r.costInLocalCurrency / r.videoViews : undefined),
  roas: (r) => (r.costInLocalCurrency > 0 ? r.conversionValueInLocalCurrency / r.costInLocalCurrency : undefined),
  openRate: (r) => (r.sends > 0 ? r.opens / r.sends : undefined),
  viralShareOfImpressions: (r) =>
    r.impressions + r.viralImpressions > 0
      ? r.viralImpressions / (r.impressions + r.viralImpressions)
      : undefined,
  frequency: (r) => (r.approximateMemberReach > 0 ? r.impressions / r.approximateMemberReach : undefined),
};

/** The raw fields LinkedIn has to return for a calculated metric. */
export function dependenciesOf(keys: string[]): string[] {
  const out = new Set<string>();
  for (const key of keys) {
    const definition = LINKEDIN_CALCULATED_METRICS.find((m) => m.key === key);
    for (const dependency of definition?.dependencies ?? []) out.add(dependency);
  }
  return [...out];
}

export function isCalculated(key: string): boolean {
  return key in FORMULAS;
}

/** Adds the requested metrics to each row without overwriting existing values. */
export function applyCalculated(
  rows: LinkedInAnalyticsRow[],
  keys: string[],
): LinkedInAnalyticsRow[] {
  const wanted = keys.filter(isCalculated);
  if (wanted.length === 0) return rows;

  return rows.map((row) => {
    const numeric: Record<string, number> = {};
    for (const [field, value] of Object.entries(row)) {
      const asNumber = typeof value === "string" ? Number(value) : value;
      numeric[field] = typeof asNumber === "number" && Number.isFinite(asNumber) ? asNumber : 0;
    }
    const additions: Record<string, number> = {};
    for (const key of wanted) {
      const value = FORMULAS[key]!(numeric);
      // A zero denominator is not a zero value: the metric does not exist for
      // this row, and writing 0 would read as underperformance.
      if (value !== undefined && Number.isFinite(value)) {
        additions[key] = Math.round(value * 1_000_000) / 1_000_000;
      }
    }
    return { ...row, ...additions };
  });
}

import { LINKEDIN_DEMOGRAPHIC_PIVOTS } from "./catalog/dimensions.js";
import { findMetric } from "./catalog/metrics.js";

export type CompatibilityIssue = {
  severity: "error" | "warning";
  field: string;
  reason: string;
};

/**
 * What LinkedIn refuses or silently drops.
 *
 * The API returns no error when a metric does not exist for a pivot: the field
 * simply disappears from the response. An agent then reads zero where there is
 * nothing, and reports a performance drop that never happened. These rules
 * state the constraint before the call.
 */
export function checkCompatibility(
  pivots: string[],
  metrics: string[],
  options: { timeGranularity?: string; dayCount?: number } = {},
): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  const demographic = pivots.filter((p) => LINKEDIN_DEMOGRAPHIC_PIVOTS.includes(p));

  for (const metric of metrics) {
    const definition = findMetric(metric);
    if (!definition) {
      issues.push({
        severity: "error",
        field: metric,
        reason: `${metric} is not a LinkedIn Ads metric. Read the linkedin://metrics resource for the full list.`,
      });
      continue;
    }
    const clash = (definition.incompatibleWith ?? []).filter((p) => pivots.includes(p));
    if (clash.length > 0) {
      issues.push({
        severity: "error",
        field: definition.key,
        reason: `LinkedIn does not return ${definition.key} with the ${clash.join(", ")} pivot. The field is dropped from the response rather than refused, so the row would read as zero.`,
      });
    }
  }

  if (demographic.length > 0) {
    issues.push({
      severity: "warning",
      field: demographic.join(", "),
      reason:
        "Professional demographic pivots return the top 100 values per creative per day, drop any value with fewer than 3 events, are approximate by design and can lag by 12 to 24 hours. They are retained for 2 years, against 10 years for performance data.",
    });
    if (demographic.length > 1) {
      issues.push({
        severity: "warning",
        field: demographic.join(", "),
        reason: "Crossing two professional demographic pivots multiplies the approximation and often returns far fewer rows than expected.",
      });
    }
  }

  if (pivots.includes("IMPRESSION_DEVICE_TYPE")) {
    issues.push({
      severity: "warning",
      field: "IMPRESSION_DEVICE_TYPE",
      reason: "Reach metrics and conversion metrics are not available with this pivot.",
    });
  }

  if (metrics.includes("approximateMemberReach") && (options.dayCount ?? 0) > 92) {
    issues.push({
      severity: "error",
      field: "approximateMemberReach",
      reason: "LinkedIn only returns reach for a date range of 92 days or less. The requested range is longer, so the field would come back empty.",
    });
  }

  if (metrics.includes("audiencePenetration")) {
    const primary = ["ACCOUNT", "CAMPAIGN_GROUP", "CAMPAIGN"];
    if (!pivots.some((p) => primary.includes(p))) {
      issues.push({
        severity: "error",
        field: "audiencePenetration",
        reason: "audiencePenetration needs at least one of the ACCOUNT, CAMPAIGN_GROUP or CAMPAIGN pivots.",
      });
    }
    if ((options.dayCount ?? 0) > 92) {
      issues.push({
        severity: "warning",
        field: "audiencePenetration",
        reason: "audiencePenetration is null beyond a 92 day range.",
      });
    }
  }

  if (options.timeGranularity === "ALL" && (options.dayCount ?? 0) > 180) {
    issues.push({
      severity: "warning",
      field: "dateRange",
      reason:
        "With timeGranularity ALL and a range that reaches outside the 6 month daily retention window, LinkedIn rounds the boundaries to whole months and includes those full months.",
    });
  }

  if (metrics.some((m) => m === "videoWatchTime" || m === "averageVideoWatchTime")) {
    issues.push({
      severity: "warning",
      field: "videoWatchTime",
      reason: "Video watch time can lag by up to 48 hours, so the last two days are usually understated.",
    });
  }

  return issues;
}

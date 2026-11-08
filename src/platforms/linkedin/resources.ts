/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { LINKEDIN_DIMENSION_CATALOG, LINKEDIN_PIVOTS } from "./catalog/dimensions.js";
import { LINKEDIN_METRIC_CATALOG } from "./catalog/metrics.js";
import type { Collector, LinkedInContext, ResourceResult } from "./context.js";

export const RESOURCE_URIS = [
  "linkedin://manifest",
  "linkedin://metrics",
  "linkedin://pivots",
  "linkedin://reporting-rules",
  "linkedin://targeting",
  "linkedin://recipes",
] as const;

function json(uri: string, body: unknown): ResourceResult {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(body, null, 2) }] };
}

export function registerLinkedInResources(c: Collector, ctx: LinkedInContext): void {
  if (!c.resource) return;

  c.resource("linkedin-manifest", "linkedin://manifest", async () =>
    json("linkedin://manifest", {
      name: "LinkedIn Ads MCP",
      platform: "linkedin_ads",
      apiVersion: `LinkedIn Marketing API, LinkedIn-Version ${ctx.config.apiVersion}`,
      configuredAccounts: ctx.config.allowedAccountIds,
      writesEnabled: ctx.config.enableWrites,
      hierarchy: [
        "Ad account holds the currency and the billing.",
        "Campaign group holds a shared budget, a schedule and a bid strategy.",
        "Campaign holds the targeting, the objective and the bid.",
        "Creative is the ad itself, and carries its own review verdict.",
      ],
      resources: [...RESOURCE_URIS],
      safety: [
        "Only the ad accounts listed in LINKEDIN_ADS_ACCOUNT_IDS are read or changed.",
        "Reads never return an OAuth token.",
        "Write tools exist only when LINKEDIN_ADS_ENABLE_WRITES is true, preview by default and need an explicit confirm.",
        "Campaign groups, campaigns and ads created through this server are always DRAFT. Activation is not offered.",
        "No tool returns submitted lead gen data.",
      ],
    }),
  );

  c.resource("linkedin-metrics", "linkedin://metrics", async () =>
    json("linkedin://metrics", {
      total: LINKEDIN_METRIC_CATALOG.length,
      fromApi: LINKEDIN_METRIC_CATALOG.filter((m) => m.type === "api").length,
      computedByServer: LINKEDIN_METRIC_CATALOG.filter((m) => m.type === "calculated").length,
      fieldCeiling:
        "LinkedIn accepts at most 20 fields per report, and dateRange plus pivotValues take two of them. " +
        "A calculated metric costs its inputs, not one slot.",
      metrics: LINKEDIN_METRIC_CATALOG.map((metric) => ({
        key: metric.key,
        name: metric.name,
        description: metric.description,
        category: metric.category,
        format: metric.format,
        apiField: metric.apiField || null,
        source: metric.type === "calculated" ? "computed by this server" : "returned by LinkedIn",
        formula: metric.formula,
        unavailableWith: metric.incompatibleWith,
      })),
    }),
  );

  c.resource("linkedin-pivots", "linkedin://pivots", async () =>
    json("linkedin://pivots", {
      pivots: LINKEDIN_PIVOTS,
      finders: {
        analytics: "One pivot. Used by linkedin_get_insights and linkedin_get_demographics.",
        statistics: "Up to three pivots at once. Used by linkedin_run_statistics_report.",
        attributedRevenueMetrics: "ACCOUNT, CAMPAIGN_GROUP or CAMPAIGN only. Used by linkedin_get_revenue_attribution.",
      },
      dimensions: LINKEDIN_DIMENSION_CATALOG.map((dimension) => ({
        key: dimension.key,
        name: dimension.name,
        description: dimension.description,
        category: dimension.category,
        apiField: dimension.apiField,
        requiredLevel: dimension.requiredLevel,
        incompatibleWith: dimension.incompatibleWith,
      })),
    }),
  );

  c.resource("linkedin-reporting-rules", "linkedin://reporting-rules", async () =>
    json("linkedin://reporting-rules", {
      scoping:
        "adAnalytics needs at least one entity facet: accounts, campaigns, campaignGroups or creatives. " +
        "Without one it returns an empty list rather than an error, which reads as zero spend. Every report of this server is scoped on its ad account.",
      pagination: "adAnalytics does not paginate. A report is capped at 15,000 rows.",
      retention: {
        performance: "10 years.",
        professionalDemographics: "2 years.",
        dailyGranularity:
          "Daily rows older than 6 months are rolled up. With timeGranularity ALL over such a range, LinkedIn rounds the boundaries to whole months.",
      },
      freshness: {
        performance: "Near real time.",
        demographics: "Can lag 12 to 24 hours.",
        videoWatchTime: "Can lag up to 48 hours.",
      },
      demographics: [
        "Top 100 values per creative per day.",
        "Values with fewer than 3 events are dropped.",
        "Approximate by design, so daily rows summed will not match the same range asked for once.",
        "Carousel metrics, conversion value and reach are not returned with a demographic pivot.",
      ],
      throttling:
        "45 million metric values per five minutes, counted as fields times rows. Asking for fewer fields is the fix, not retrying.",
      ratios:
        "LinkedIn returns raw terms only. CTR, CPC, CPM, CPL, CPA and the rest are computed by this server from the fields it requested, and are omitted rather than set to zero when the denominator is zero.",
      money:
        "Spend, budgets and bids are in account currency units, as decimal strings. They are not micros or cents.",
      viral:
        "Viral impressions are not included in impressions. Adding the two double counts nothing, but reporting only impressions understates the reach a campaign paid for.",
    }),
  );

  c.resource("linkedin-targeting", "linkedin://targeting", async () =>
    json("linkedin://targeting", {
      shape:
        "A campaign stores targeting as a boolean tree of facet URNs: " +
        '{ include: { and: [ { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:105015875"] } }, { or: { "urn:li:adTargetingFacet:seniorities": ["urn:li:seniority:6"] } } ] }, exclude: { or: { "urn:li:adTargetingFacet:industries": ["urn:li:industry:47"] } } }. ' +
        "Groups in include.and are combined with AND, values inside one or group with OR.",
      discovery: [
        "linkedin_find_targeting turns a name, such as a country or a job title, into the URN a campaign stores.",
        "Locations and profile locations only answer through typeahead since the Bing geo migration.",
        "linkedin_get_campaigns with includeTargeting returns the criteria a campaign stores today.",
      ],
      limits: [
        "Most facets cap a campaign at 100 entities, employers and geos at 200.",
        "A campaign needs an audience of at least 300 members to run.",
        "Member group targeting is disabled in the EEA and Switzerland.",
      ],
      widening:
        "audienceExpansionEnabled and offsiteDeliveryEnabled both reach beyond the stated criteria. Reading the criteria alone overstates how tightly a campaign is targeted. Campaigns created by this server leave both off.",
      notice:
        "LinkedIn tools may not be used to discriminate based on personal characteristics such as gender, age, race or ethnicity.",
    }),
  );

  c.resource("linkedin-recipes", "linkedin://recipes", async () =>
    json("linkedin://recipes", {
      recipes: [
        {
          question: "Which ad accounts can this server use?",
          steps: ["linkedin_list_ad_accounts lists the configured accounts the token reaches.", "linkedin_health_check explains any account it cannot reach."],
        },
        {
          question: "Why is nothing serving on this account?",
          steps: [
            "linkedin_get_delivery_status with the account.",
            "Read blockedByReason: a parent hold makes everything under it moot.",
            "If the holds are creative level, linkedin_get_creatives returns each review verdict and its rejection reasons.",
          ],
        },
        {
          question: "What did we spend by campaign last month, with CPC and CPM?",
          steps: [
            "linkedin_get_insights with pivot CAMPAIGN, timeGranularity ALL and the default metrics.",
            "The ratios come back computed, with the raw terms alongside them.",
          ],
        },
        {
          question: "Which job titles and company sizes actually saw the ads?",
          steps: [
            "linkedin_get_demographics with breakdown MEMBER_JOB_TITLE, then MEMBER_COMPANY_SIZE.",
            "Read the caveats: this is a truncated, approximate top 100, not a census.",
          ],
        },
        {
          question: "Did LinkedIn influence pipeline, not just clicks?",
          steps: [
            "linkedin_get_revenue_attribution with pivot CAMPAIGN over 30 to 366 days.",
            "An empty answer means no CRM is connected, not that nothing converted.",
          ],
        },
        {
          question: "How do I prepare a sponsored image ad?",
          steps: [
            "linkedin_create_campaign_group, then linkedin_create_campaign with type SPONSORED_UPDATES. Both stay DRAFT.",
            "linkedin_initialize_upload, linkedin_upload_part for each part, and linkedin_finalize_upload for a video.",
            "linkedin_get_media until the file is AVAILABLE, then linkedin_create_media_ad.",
            "Every step previews first. Activation happens in Campaign Manager.",
          ],
        },
      ],
    }),
  );
}

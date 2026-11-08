/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Account structure, reporting and delivery reads.
 */
import { z } from "zod";
import { errorMessage, LinkedInMcpError } from "../../core/errors.js";
import { applyCalculated } from "./calculated-metrics.js";
import { accountUrn, campaignGroupUrn, campaignUrn, type LinkedInClient, urnId } from "./client.js";
import { checkCompatibility } from "./compatibility-rules.js";
import { LINKEDIN_PIVOTS } from "./catalog/dimensions.js";
import { addRead, assertAllowed, type Collector, type LinkedInContext } from "./context.js";
import { dayCountOf, missingFieldNote, parseDate, planQuery, resolvePivot } from "./query-planner.js";
import type { LinkedInAdAccount, LinkedInAnalyticsRow, LinkedInCampaign, LinkedInCreative } from "./types.js";
import type { NativeObject } from "./transport.js";

const ACCOUNT_STATUSES = ["ACTIVE", "DRAFT", "CANCELED", "PENDING_DELETION", "REMOVED"] as const;
const CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "COMPLETED", "CANCELED", "DRAFT", "PENDING_DELETION", "REMOVED"] as const;
const GROUP_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "CANCELED", "DRAFT", "PENDING_DELETION", "REMOVED"] as const;
const CREATIVE_STATUSES = ["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED", "CANCELED", "PENDING_DELETION", "REMOVED"] as const;
const CAMPAIGN_TYPES = ["TEXT_AD", "SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"] as const;
const GRANULARITY = ["ALL", "DAILY", "MONTHLY", "YEARLY"] as const;
const DEMOGRAPHICS = [
  "MEMBER_COMPANY", "MEMBER_COMPANY_SIZE", "MEMBER_INDUSTRY", "MEMBER_SENIORITY", "MEMBER_JOB_TITLE",
  "MEMBER_JOB_FUNCTION", "MEMBER_COUNTRY_V2", "MEMBER_REGION_V2", "MEMBER_COUNTY",
] as const;
const OBJECTIVES = [
  "LEAD_GENERATION", "CREATIVE_ENGAGEMENT", "WEBSITE_TRAFFIC", "VIDEO_VIEW", "BRAND_AWARENESS",
  "WEBSITE_CONVERSION", "WEBSITE_VISIT", "ENGAGEMENT", "JOB_APPLICANT",
] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ids = (description: string) => z.array(z.string().regex(/^(urn:li:[A-Za-z]+:)?\d+$/)).max(100).optional().describe(description);
const pageSize = z.number().int().min(1).max(100).optional().describe("Maximum items in this page, 1 to 100. Defaults to 100.");
const pageToken = z.string().max(2000).optional().describe("Opaque nextPageToken from the preceding response; omit for the first page.");

const DEFAULT_METRICS = ["costInLocalCurrency", "impressions", "clicks", "externalWebsiteConversions", "ctr", "cpc", "cpm"];

export function registerLinkedInTools(c: Collector, ctx: LinkedInContext): void {
  /* Configuration and accounts */

  addRead(
    c,
    ctx,
    "linkedin_health_check",
    "Read-only LinkedIn Ads health check. Confirms the token works, lists which configured ad accounts it can " +
      "reach, checks the reporting endpoint and reports the API version header in use, without ever returning " +
      "the token itself.",
    {
      adAccountId: z.string().regex(/^\d+$/).optional().describe("Optional configured account to probe for reporting access. Defaults to the first reachable one."),
    },
    async (a, { client }) => {
      const checks: { name: string; status: "ok" | "warning" | "error"; detail: string }[] = [];
      const actions: string[] = [];
      const configured = ctx.config.allowedAccountIds;
      checks.push({
        name: "credentials_configured",
        status: ctx.auth.hasCredentials() ? "ok" : "error",
        detail: ctx.auth.canRefresh()
          ? "Refresh credentials are configured; the access token is renewed in memory."
          : "An access token is configured. Without refresh credentials it has to be replaced when it expires, after 60 days.",
      });
      checks.push({
        name: "api_version",
        status: "ok",
        detail: `Requests send LinkedIn-Version: ${client.apiVersion}. LinkedIn supports each version for at least a year and refuses unversioned calls.`,
      });

      let accounts: LinkedInAdAccount[] = [];
      try {
        accounts = await listAllowedAccounts(client, configured);
        const missing = configured.filter((id) => !accounts.some((account) => String(account.id) === id));
        checks.push({
          name: "configured_accounts",
          status: missing.length === 0 ? "ok" : accounts.length > 0 ? "warning" : "error",
          detail: `${accounts.length} of ${configured.length} configured ad account(s) reachable.${missing.length ? ` Not reachable: ${missing.join(", ")}.` : ""}`,
        });
        if (missing.length > 0) {
          actions.push(
            "Check each unreachable ID in Campaign Manager, and give the authenticated member a role on that account.",
          );
        }
      } catch (error) {
        checks.push({ name: "configured_accounts", status: "error", detail: errorMessage(error) });
        actions.push("Check that the app has the Advertising API product and that the token carries the r_ads scope.");
        return { status: "error", checks, actions, apiVersion: client.apiVersion };
      }

      const probe = a.adAccountId ?? (accounts[0]?.id !== undefined ? String(accounts[0].id) : undefined);
      if (probe) {
        try {
          await client.analytics({
            pivot: "ACCOUNT",
            dateRange: { start: startOfWindow(7) },
            timeGranularity: "ALL",
            fields: ["impressions", "clicks", "costInLocalCurrency", "dateRange", "pivotValues"],
            accounts: [probe],
          });
          checks.push({ name: "ad_analytics", status: "ok", detail: `adAnalytics readable for account ${probe}.` });
        } catch (error) {
          checks.push({ name: "ad_analytics", status: "warning", detail: errorMessage(error) });
          actions.push("Reporting needs the r_ads_reporting scope in addition to r_ads.");
        }
      } else {
        checks.push({ name: "ad_analytics", status: "warning", detail: "Skipped: no reachable configured account to probe." });
      }
      checks.push({
        name: "writes",
        status: "ok",
        detail: ctx.config.enableWrites
          ? "Write tools are enabled. Each one previews unless called with confirm: true."
          : "Write tools are disabled. Set LINKEDIN_ADS_ENABLE_WRITES=true to expose them.",
      });

      const status = checks.some((check) => check.status === "error")
        ? "error"
        : checks.some((check) => check.status === "warning")
          ? "warning"
          : "ok";
      return {
        status,
        apiVersion: client.apiVersion,
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          status: account.status,
          currency: account.currency,
          test: account.test,
        })),
        checks,
        actions,
        tokenExposure: "No token value is returned by any tool of this server.",
      };
    },
    { account: "optional" },
  );

  addRead(
    c,
    ctx,
    "linkedin_list_ad_accounts",
    "List the LinkedIn sponsored ad accounts configured in LINKEDIN_ADS_ACCOUNT_IDS that the authenticated member " +
      "can reach, with currency, status and serving status. Accounts outside the configured list are never " +
      "returned. Test accounts are excluded unless asked for.",
    {
      adAccountIds: z.array(z.string().regex(/^\d+$/)).max(100).optional().describe("Configured account IDs to list. Defaults to every configured account."),
      status: z.array(z.enum(ACCOUNT_STATUSES)).optional().describe("Keep only accounts in these native statuses."),
      includeTestAccounts: z.boolean().optional().describe("Test accounts never serve and never report. Off by default."),
    },
    async (a, { client }) => {
      const requested: string[] = a.adAccountIds ?? ctx.config.allowedAccountIds;
      for (const id of requested) assertAllowed(ctx, id);
      const rows = (await listAllowedAccounts(client, requested, a.status)).filter((account) => requested.includes(String(account.id)));
      const shown = a.includeTestAccounts ? rows : rows.filter((account) => account.test !== true);
      return {
        accounts: shown.map((account) => ({
          id: account.id,
          urn: account.id === undefined ? undefined : accountUrn(String(account.id)),
          name: account.name,
          currency: account.currency,
          status: account.status,
          type: account.type,
          test: account.test,
          servingStatuses: account.servingStatuses,
          reference: account.reference,
        })),
        count: shown.length,
        hiddenTestAccounts: rows.length - shown.length,
        notReachable: requested.filter((id) => !rows.some((account) => String(account.id) === id)),
        configuredAccountsOnly: true,
      };
    },
    { account: "none" },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_account_details",
    "Read one LinkedIn ad account in full, with the members who hold a role on it. Roles decide what the " +
      "connection can do, so a read that fails on one account and works on another is usually a role, not a scope.",
    {
      includeUsers: z.boolean().optional().describe("Also list the account users and their roles. On by default."),
    },
    async (a, { client }) => {
      const account = await client.getAdAccount(a.adAccountId);
      let users: unknown[] | undefined;
      let usersNote: string | undefined;
      if (a.includeUsers !== false) {
        try {
          const page = await client.getAdAccountUsers(a.adAccountId);
          users = (page.elements ?? []).map((user) => ({ user: user.user, role: user.role, account: user.account }));
        } catch (error) {
          usersNote = `Account users could not be read: ${errorMessage(error)}`;
        }
      }
      return {
        account: {
          id: account.id,
          urn: accountUrn(a.adAccountId),
          name: account.name,
          currency: account.currency,
          status: account.status,
          type: account.type,
          test: account.test,
          reference: account.reference,
          servingStatuses: account.servingStatuses,
          servingStatusMeaning:
            account.test === true
              ? "Test account: never serves or incurs advertising charges, regardless of native RUNNABLE status."
              : (account.servingStatuses ?? []).length === 1 && account.servingStatuses?.[0] === "RUNNABLE"
                ? "The account itself is eligible to serve."
                : "The account is not eligible to serve. Each value names one reason, and every one of them has to clear before ads run.",
        },
        users,
        usersNote,
      };
    },
    { account: "required" },
  );

  /* Structure */

  addRead(
    c,
    ctx,
    "linkedin_get_campaign_groups",
    "List campaign groups in a LinkedIn ad account, with budget, schedule and serving status. On LinkedIn the " +
      "campaign group is where a shared budget and a bid strategy live, so it is the level that explains why " +
      "sibling campaigns stopped together.",
    {
      status: z.array(z.enum(GROUP_STATUSES)).optional().describe("Keep only campaign groups in these native statuses."),
      name: z.array(z.string().min(1).max(200)).max(50).optional().describe("Exact campaign group names to match."),
      pageSize,
      pageToken,
    },
    async (a, { client }) => {
      const page = await client.searchCampaignGroups(a.adAccountId, {
        status: a.status,
        name: a.name,
        pageSize: a.pageSize,
        pageToken: a.pageToken,
      });
      return {
        campaignGroups: (page.elements ?? []).map((group) => ({
          id: group.id,
          urn: group.id === undefined ? undefined : campaignGroupUrn(String(group.id)),
          name: group.name,
          status: group.status,
          objectiveType: group.objectiveType,
          backfilled: group.backfilled,
          defaultGroup: group.backfilled === true,
          runSchedule: humanSchedule(group.runSchedule),
          totalBudget: group.totalBudget,
          dailyBudget: group.dailyBudget,
          budgetOptimization: group.budgetOptimization,
          allowedCampaignTypes: group.allowedCampaignTypes,
          servingStatuses: group.servingStatuses,
        })),
        count: page.elements?.length ?? 0,
        nextPageToken: page.metadata?.nextPageToken ?? null,
      };
    },
    { account: "required" },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_campaigns",
    "List campaigns in a LinkedIn ad account with status, objective, format, bid strategy, budget and schedule. " +
      "On LinkedIn the campaign holds the targeting and the bid, and the creatives under it are the ads.",
    {
      status: z.array(z.enum(CAMPAIGN_STATUSES)).optional().describe("Keep only campaigns in these native statuses."),
      type: z.array(z.enum(CAMPAIGN_TYPES)).optional().describe("Keep only these campaign formats, such as TEXT_AD or SPONSORED_UPDATES."),
      name: z.array(z.string().min(1).max(200)).max(50).optional().describe("Exact campaign names to match."),
      campaignGroupId: z.string().regex(/^(urn:li:sponsoredCampaignGroup:)?\d+$/).optional().describe("Keep only campaigns in this campaign group of the selected account."),
      includeTargeting: z.boolean().optional().describe("Return the raw targetingCriteria object. Off by default because it is verbose."),
      pageSize,
      pageToken,
    },
    async (a, { client }) => {
      const page = await client.searchCampaigns(a.adAccountId, {
        status: a.status,
        type: a.type,
        name: a.name,
        pageSize: a.pageSize,
        pageToken: a.pageToken,
      });
      let campaigns = page.elements ?? [];
      if (a.campaignGroupId) {
        const wanted = campaignGroupUrn(a.campaignGroupId);
        campaigns = campaigns.filter((campaign) => campaign.campaignGroup === wanted);
      }
      return {
        campaigns: campaigns.map((campaign) => summariseCampaign(campaign, a.includeTargeting === true)),
        count: campaigns.length,
        nextPageToken: page.metadata?.nextPageToken ?? null,
        ...(a.campaignGroupId
          ? { note: "campaignGroupId is applied to the returned page, so paginate until nextPageToken is null before concluding a group is empty." }
          : {}),
      };
    },
    { account: "required", verifyChildren: true },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_creatives",
    "List the creatives of a LinkedIn ad account, optionally for given campaigns. A creative is the ad itself, and " +
      "it carries its own intended status, its review verdict and the reasons it is being held back.",
    {
      campaignIds: ids("Sponsored campaign IDs or URNs in the selected account."),
      intendedStatuses: z.array(z.enum(CREATIVE_STATUSES)).optional().describe("Filter by native configured ad statuses, not effective delivery status."),
      includeContent: z.boolean().optional().describe("Return the raw content object of each creative. Off by default."),
      pageSize,
      pageToken,
    },
    async (a, { client }) => {
      const page = await client.searchCreatives(a.adAccountId, {
        campaigns: a.campaignIds,
        intendedStatuses: a.intendedStatuses,
        pageSize: a.pageSize,
        pageToken: a.pageToken,
      });
      return {
        creatives: (page.elements ?? []).map((creative) => summariseCreative(creative, a.includeContent === true)),
        count: page.elements?.length ?? 0,
        nextPageToken: page.metadata?.nextPageToken ?? null,
      };
    },
    { account: "required", verifyChildren: true },
  );

  /* Reporting */

  const reportScope = {
    campaignIds: ids("Restrict reporting to these campaign IDs or URNs in the selected account."),
    campaignGroupIds: ids("Restrict reporting to these owned campaign-group IDs."),
  };

  addRead(
    c,
    ctx,
    "linkedin_get_insights",
    "Run a LinkedIn Ads report grouped by one pivot. This is the analytics finder: one pivot, any granularity, and " +
      "up to 20 fields including dateRange and pivotValues. Ratios such as CTR, CPC and CPM do not exist in the API " +
      "and are computed here from the raw terms.",
    {
      ...reportScope,
      creativeIds: ids("Restrict reporting to these owned creative IDs."),
      pivot: z.string().max(40).optional().describe(`Grouping. Defaults to CAMPAIGN. One of: ${LINKEDIN_PIVOTS.join(", ")}.`),
      startDate: dateSchema.describe("Inclusive start, YYYY-MM-DD."),
      endDate: dateSchema.optional().describe("Inclusive end, YYYY-MM-DD. Defaults to today."),
      timeGranularity: z.enum(GRANULARITY).optional().describe("Defaults to ALL, one row for the whole range."),
      metrics: z.array(z.string().max(60)).max(40).optional().describe("Metric keys from linkedin://metrics. Defaults to spend, impressions, clicks and the ratios."),
      campaignType: z.enum(CAMPAIGN_TYPES).optional().describe("Native campaign format filter."),
      sortField: z
        .enum(["COST_IN_LOCAL_CURRENCY", "IMPRESSIONS", "CLICKS", "ONE_CLICK_LEADS", "OPENS", "SENDS", "EXTERNAL_WEBSITE_CONVERSIONS"])
        .optional()
        .describe("Native field used to order the returned rows."),
      sortOrder: z.enum(["ASCENDING", "DESCENDING"]).optional().describe("Ascending or descending native result ordering."),
    },
    async (a, { client }) => {
      const scope = requireScope(a);
      const plan = planQuery({
        pivots: [String(a.pivot ?? "CAMPAIGN")],
        metrics: a.metrics ?? DEFAULT_METRICS,
        startDate: a.startDate,
        endDate: a.endDate,
        timeGranularity: a.timeGranularity,
      });
      const page = await client.analytics({
        pivot: plan.pivots[0],
        dateRange: plan.dateRange,
        timeGranularity: plan.timeGranularity,
        fields: plan.fields,
        ...scope,
        campaignType: a.campaignType,
        sortField: a.sortField,
        sortOrder: a.sortOrder,
      });
      return shapeReport(page.elements ?? [], plan);
    },
    { account: "required", verifyChildren: true },
  );

  addRead(
    c,
    ctx,
    "linkedin_run_statistics_report",
    "Run a LinkedIn Ads report grouped by up to three pivots at once. This is the statistics finder, the only way " +
      "to cross campaign with device, or campaign group with serving location, in a single request.",
    {
      ...reportScope,
      creativeIds: ids("Restrict reporting to these owned creative IDs."),
      pivots: z.array(z.string().max(40)).min(1).max(3).describe("One to three pivots. Order decides the order of pivotValues."),
      startDate: dateSchema.describe("Inclusive start, YYYY-MM-DD."),
      endDate: dateSchema.optional().describe("Inclusive end, YYYY-MM-DD. Defaults to today."),
      timeGranularity: z.enum(GRANULARITY).optional().describe("Native reporting aggregation interval. Defaults to ALL."),
      metrics: z.array(z.string().max(60)).max(40).optional().describe("Metric keys from linkedin://metrics. Defaults to spend, impressions, clicks and the ratios."),
      campaignType: z.enum(CAMPAIGN_TYPES).optional().describe("Native campaign format filter."),
      objectiveType: z.enum(OBJECTIVES).optional().describe("Native campaign objective filter."),
    },
    async (a, { client }) => {
      const scope = requireScope(a);
      const plan = planQuery({
        pivots: a.pivots,
        metrics: a.metrics ?? DEFAULT_METRICS,
        startDate: a.startDate,
        endDate: a.endDate,
        timeGranularity: a.timeGranularity,
      });
      const page = await client.analytics({
        pivots: plan.pivots,
        dateRange: plan.dateRange,
        timeGranularity: plan.timeGranularity,
        fields: plan.fields,
        ...scope,
        campaignType: a.campaignType,
        objectiveType: a.objectiveType,
      });
      return {
        ...shapeReport(page.elements ?? [], plan),
        pivotOrder: plan.pivots,
        pivotValuesNote: "pivotValues holds one URN per pivot, in the order of pivotOrder.",
      };
    },
    { account: "required", verifyChildren: true },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_demographics",
    "Break LinkedIn delivery down by professional demographics: company, company size, industry, seniority, job " +
      "title, job function or location. These are the numbers LinkedIn is bought for, and they come with limits " +
      "the tool states alongside the rows.",
    {
      ...reportScope,
      breakdown: z.enum(DEMOGRAPHICS).describe("Which professional demographic to group by."),
      startDate: dateSchema.describe("Inclusive start, YYYY-MM-DD."),
      endDate: dateSchema.optional().describe("Inclusive end, YYYY-MM-DD. Defaults to today."),
      metrics: z
        .array(z.string().max(60))
        .max(40)
        .optional()
        .describe("Defaults to spend, impressions, clicks and CTR. Conversion value, carousel and reach fields are not available here."),
      resolveNames: z.boolean().optional().describe("Resolve the returned URNs to readable names. On by default."),
      limit: z.number().int().min(1).max(200).optional().describe("Keep only the top rows by impressions. Defaults to 50."),
    },
    async (a, { client }) => {
      const scope = requireScope(a);
      const plan = planQuery({
        pivots: [String(a.breakdown)],
        metrics: a.metrics ?? ["costInLocalCurrency", "impressions", "clicks", "ctr"],
        startDate: a.startDate,
        endDate: a.endDate,
        timeGranularity: "ALL",
      });
      const page = await client.analytics({
        pivot: plan.pivots[0],
        dateRange: plan.dateRange,
        timeGranularity: "ALL",
        fields: plan.fields,
        ...scope,
      });
      const limit = Number(a.limit ?? 50);
      const rows = applyCalculated(page.elements ?? [], plan.calculated)
        .slice()
        .sort((x, y) => Number(y.impressions ?? 0) - Number(x.impressions ?? 0))
        .slice(0, limit);
      let names: Record<string, string> | undefined;
      if (a.resolveNames !== false && rows.length > 0) {
        names = await resolveNames(client, rows.flatMap((row) => row.pivotValues ?? []));
      }
      return {
        breakdown: plan.pivots[0],
        rows: rows.map((row) => ({
          ...row,
          label: names ? (row.pivotValues ?? []).map((urn) => names?.[urn] ?? urn).join(" / ") : undefined,
        })),
        returned: rows.length,
        truncatedTo: limit,
        caveats: [
          "LinkedIn returns the top 100 demographic values per creative per day, so the tail is missing rather than empty.",
          "Values with fewer than 3 events are dropped to protect member privacy.",
          "These numbers are approximate by design, and can lag performance data by 12 to 24 hours.",
          "Demographic data is retained for 2 years, against 10 years for performance data.",
        ],
      };
    },
    { account: "required", verifyChildren: true },
  );

  addRead(
    c,
    ctx,
    "linkedin_validate_query",
    "Check a pivot and metric combination against the LinkedIn reporting rules before spending a call on it. " +
      "Returns the fields that would actually be sent, the ones LinkedIn would drop, and the twenty field ceiling. " +
      "Makes no request to LinkedIn.",
    {
      pivots: z.array(z.string().max(40)).min(1).max(3).describe("One to three pivots, as a report would group them."),
      metrics: z.array(z.string().max(60)).min(1).max(40).describe("Metric keys from linkedin://metrics."),
      startDate: dateSchema.optional().describe("Inclusive start, YYYY-MM-DD. Defaults to 30 days ago."),
      endDate: dateSchema.optional().describe("Inclusive end, YYYY-MM-DD. Defaults to today."),
      timeGranularity: z.enum(GRANULARITY).optional().describe("Native reporting aggregation interval. Defaults to ALL."),
    },
    async (a) => {
      const start = a.startDate ?? isoDate(startOfWindow(30));
      try {
        const plan = planQuery({
          pivots: a.pivots,
          metrics: a.metrics,
          startDate: start,
          endDate: a.endDate,
          timeGranularity: a.timeGranularity,
        });
        return {
          valid: true,
          pivots: plan.pivots,
          fieldsSentToLinkedIn: plan.fields,
          fieldCount: plan.fields.length,
          fieldCeiling: 20,
          computedByServer: plan.calculated,
          warnings: plan.issues.filter((issue) => issue.severity === "warning"),
        };
      } catch (error) {
        const pivots = (a.pivots as string[]).map((pivot) => {
          try {
            return resolvePivot(pivot);
          } catch {
            return pivot;
          }
        });
        return {
          valid: false,
          reason: errorMessage(error),
          pivots,
          issues: checkCompatibility(pivots, a.metrics, {
            timeGranularity: a.timeGranularity,
            dayCount: a.endDate ? dayCountOf({ start: parseDate(start), end: parseDate(a.endDate) }) : undefined,
          }),
        };
      }
    },
    { account: "none" },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_revenue_attribution",
    "Read the LinkedIn Revenue Attribution Report: pipeline and closed won revenue from the CRM, attributed to " +
      "LinkedIn advertising. Only answers for accounts whose Business Manager has a CRM connected, and only over a " +
      "window of 30 to 366 days.",
    {
      pivots: z.array(z.enum(["ACCOUNT", "CAMPAIGN_GROUP", "CAMPAIGN"])).min(1).max(3).optional().describe("One to three of ACCOUNT, CAMPAIGN_GROUP and CAMPAIGN. Defaults to CAMPAIGN."),
      startDate: dateSchema.describe("Inclusive start, YYYY-MM-DD. The window must cover 30 to 366 days."),
      endDate: dateSchema.optional().describe("Inclusive end, YYYY-MM-DD. Defaults to today."),
      ...reportScope,
    },
    async (a, { client }) => {
      const start = parseDate(a.startDate);
      const end = a.endDate ? parseDate(a.endDate) : undefined;
      const page = await client.revenueAttribution({
        account: a.adAccountId,
        pivots: a.pivots ?? ["CAMPAIGN"],
        dateRange: { start, ...(end ? { end } : {}) },
        campaigns: a.campaignIds,
        campaignGroups: a.campaignGroupIds,
      });
      return {
        rows: page.elements ?? [],
        rowCount: page.elements?.length ?? 0,
        requirements: [
          "The ad account has to be claimed in a Business Manager with Salesforce, Dynamics 365 or HubSpot connected.",
          "The first data can take up to 72 hours to appear after the CRM is connected.",
          "The window must be between 30 and 366 days.",
          "openOpportunities and opportunityAmountInUsd are returned only when the range ends today in UTC.",
        ],
        ...(page.elements?.length ? {} : { note: "An empty result usually means no CRM is connected to this account, not that nothing converted." }),
      };
    },
    { account: "required", verifyChildren: true },
  );

  /* Delivery */

  addRead(
    c,
    ctx,
    "linkedin_get_delivery_status",
    "Explain why LinkedIn ads are or are not serving, from the account down to the creative. LinkedIn keeps a user " +
      "status and a system serving status side by side, and it is almost always the second one that says why " +
      "nothing is running.",
    {
      campaignIds: ids("Limit the campaign and creative scan to these campaigns."),
      includeCreatives: z.boolean().optional().describe("Also scan creatives. On by default."),
    },
    async (a, { client }) => {
      const account = await client.getAdAccount(a.adAccountId);
      const [groups, campaigns] = await Promise.all([
        client.searchCampaignGroups(a.adAccountId, { pageSize: 100 }),
        client.searchCampaigns(a.adAccountId, { pageSize: 100 }),
      ]);
      const wanted = (a.campaignIds as string[] | undefined)?.map((id) => String(urnId(campaignUrn(id))));
      const scopedCampaigns = (campaigns.elements ?? []).filter((campaign) => !wanted || wanted.includes(String(campaign.id)));

      let creatives: LinkedInCreative[] = [];
      let creativesNote: string | undefined;
      let creativesPartial = false;
      if (a.includeCreatives !== false) {
        try {
          const page = await client.searchCreatives(a.adAccountId, { campaigns: a.campaignIds, pageSize: 100 });
          creatives = page.elements ?? [];
          creativesPartial = Boolean(page.metadata?.nextPageToken);
        } catch (error) {
          creativesNote = `Creatives could not be read: ${errorMessage(error)}`;
        }
      }

      const blocked = [
        ...(account.servingStatuses ?? []).filter((s) => s !== "RUNNABLE").map((reason) => ({ level: "account", id: account.id, name: account.name, reason })),
        ...(groups.elements ?? []).flatMap((group) =>
          (group.servingStatuses ?? []).filter((s) => s !== "RUNNABLE").map((reason) => ({ level: "campaignGroup", id: group.id, name: group.name, reason })),
        ),
        ...scopedCampaigns.flatMap((campaign) =>
          (campaign.servingStatuses ?? []).filter((s) => s !== "RUNNABLE").map((reason) => ({ level: "campaign", id: campaign.id, name: campaign.name, reason })),
        ),
        ...creatives.flatMap((creative) =>
          (creative.servingHoldReasons ?? []).map((reason) => ({ level: "creative", id: creative.id, name: undefined, reason })),
        ),
      ];
      const test = account.test === true;
      return {
        account: { id: account.id, name: account.name, status: account.status, servingStatuses: account.servingStatuses },
        testAccount: test,
        serving: {
          campaignGroups: test ? 0 : (groups.elements ?? []).filter((g) => (g.servingStatuses ?? []).includes("RUNNABLE")).length,
          campaigns: test ? 0 : scopedCampaigns.filter((campaign) => (campaign.servingStatuses ?? []).includes("RUNNABLE")).length,
          creatives: test ? 0 : creatives.filter((creative) => creative.isServing === true).length,
        },
        counted: {
          campaignGroups: groups.elements?.length ?? 0,
          campaigns: scopedCampaigns.length,
          creatives: creatives.length,
        },
        coverage: {
          partial: Boolean(groups.metadata?.nextPageToken || campaigns.metadata?.nextPageToken) || creativesPartial,
          note: "The scan reads the first 100 campaign groups, campaigns and creatives, newest first.",
        },
        blocked,
        blockedByReason: countBy(blocked.map((b) => b.reason)),
        creativesNote,
        reading: test
          ? "Test account: no ad delivery or billing is possible. Native RUNNABLE does not establish actual serving."
          : "status is what a person set. servingStatuses and servingHoldReasons are what LinkedIn decided. Every reason listed has to clear before the ad runs, and a parent holding blocks everything under it.",
      };
    },
    { account: "required", verifyChildren: true },
  );
}

/* Helpers */

/** Lists configured accounts only: the search names their IDs, and the answer is filtered again. */
async function listAllowedAccounts(client: LinkedInClient, ids: string[], status?: string[]): Promise<LinkedInAdAccount[]> {
  const out: LinkedInAdAccount[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await client.searchAdAccounts({ ids, status, pageSize: 100, pageToken });
    for (const account of result.elements ?? []) {
      if (ids.includes(String(account.id))) out.push(account);
    }
    const next = result.metadata?.nextPageToken ?? undefined;
    if (!next) return out;
    if (seen.has(next)) throw new LinkedInMcpError("LinkedIn repeated a pagination token while listing ad accounts.", 502);
    seen.add(next);
    pageToken = next;
  }
  return out;
}

/**
 * adAnalytics needs at least one entity facet. Without one the answer is an
 * empty list, which an agent reads as zero spend instead of an incomplete
 * request. Every report here is scoped on its selected account.
 */
function requireScope(args: NativeObject): { accounts: string[]; campaigns?: string[]; campaignGroups?: string[]; creatives?: string[] } {
  return {
    accounts: [String(args.adAccountId)],
    campaigns: args.campaignIds?.length ? args.campaignIds : undefined,
    campaignGroups: args.campaignGroupIds?.length ? args.campaignGroupIds : undefined,
    creatives: args.creativeIds?.length ? args.creativeIds : undefined,
  };
}

function shapeReport(rows: LinkedInAnalyticsRow[], plan: ReturnType<typeof planQuery>) {
  const withRatios = applyCalculated(rows, plan.calculated);
  return {
    pivot: plan.pivots.length === 1 ? plan.pivots[0] : undefined,
    timeGranularity: plan.timeGranularity,
    dateRange: plan.dateRange,
    dayCount: plan.dayCount,
    rows: withRatios,
    rowCount: withRatios.length,
    computedByServer: plan.calculated,
    warnings: plan.issues.filter((issue) => issue.severity === "warning"),
    notes: [
      missingFieldNote(plan.fields, withRatios),
      withRatios.length === 0
        ? "LinkedIn returns an empty list both when there is no activity and when the credentials cannot read the requested entity. Run linkedin_health_check to tell the two apart."
        : undefined,
      withRatios.length >= 15_000
        ? "LinkedIn caps a report at 15,000 rows and does not paginate adAnalytics. Narrow the date range or the pivot."
        : undefined,
    ].filter(Boolean),
  };
}

function summariseCampaign(campaign: LinkedInCampaign, includeTargeting: boolean) {
  return {
    id: campaign.id,
    urn: campaign.id === undefined ? undefined : campaignUrn(String(campaign.id)),
    name: campaign.name,
    status: campaign.status,
    type: campaign.type,
    format: campaign.format,
    objectiveType: campaign.objectiveType,
    optimizationTargetType: campaign.optimizationTargetType,
    costType: campaign.costType,
    unitCost: campaign.unitCost,
    dailyBudget: campaign.dailyBudget,
    totalBudget: campaign.totalBudget,
    pacingStrategy: campaign.pacingStrategy,
    campaignGroup: campaign.campaignGroup,
    runSchedule: humanSchedule(campaign.runSchedule),
    locale: campaign.locale,
    offsiteDeliveryEnabled: campaign.offsiteDeliveryEnabled,
    audienceExpansionEnabled: campaign.audienceExpansionEnabled,
    creativeSelection: campaign.creativeSelection,
    associatedEntity: campaign.associatedEntity,
    servingStatuses: campaign.servingStatuses,
    ...(includeTargeting ? { targetingCriteria: campaign.targetingCriteria } : {}),
  };
}

function summariseCreative(creative: LinkedInCreative, includeContent: boolean) {
  return {
    id: creative.id,
    name: creative.name,
    campaign: creative.campaign,
    intendedStatus: creative.intendedStatus,
    isServing: creative.isServing,
    servingHoldReasons: creative.servingHoldReasons,
    review: creative.review,
    createdAt: creative.createdAt ? new Date(creative.createdAt).toISOString() : undefined,
    lastModifiedAt: creative.lastModifiedAt ? new Date(creative.lastModifiedAt).toISOString() : undefined,
    ...(includeContent ? { content: creative.content } : {}),
  };
}

function humanSchedule(schedule: { start?: number; end?: number } | undefined) {
  if (!schedule) return undefined;
  return {
    start: schedule.start ? new Date(schedule.start).toISOString() : undefined,
    end: schedule.end ? new Date(schedule.end).toISOString() : null,
  };
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function startOfWindow(days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.now() - days * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function isoDate(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/**
 * Turns pivot URNs into readable names.
 *
 * `pivotValues` holds URNs only. A report by industry that returns
 * `urn:li:industry:96` is an identifier, not a report. LinkedIn resolves
 * targeting entities in batches of one hundred.
 */
export async function resolveNames(client: LinkedInClient, urns: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(urns.filter(Boolean))];
  const out: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    try {
      const page = await client.targetingEntities({ finder: "urns", urns: batch });
      for (const entity of page.elements ?? []) {
        const urn = typeof entity.urn === "string" ? entity.urn : undefined;
        const name = typeof entity.name === "string" ? entity.name : undefined;
        if (urn && name) out[urn] = name;
      }
    } catch {
      // A failed resolution must not sink the report: the URNs stay, and the
      // reader sees that they were not translated.
    }
  }
  return out;
}

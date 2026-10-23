/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LinkedInTransport } from "./transport.js";
import type {
  LinkedInAdAccount,
  LinkedInAnalyticsRow,
  LinkedInCampaign,
  LinkedInCampaignGroup,
  LinkedInCreative,
  LinkedInDateRange,
  LinkedInPage,
} from "./types.js";

/**
 * LinkedIn Marketing reads.
 *
 * Two details shape this file. LinkedIn versions by header and refuses any
 * call without `LinkedIn-Version`, and its query parameters are Rest.li:
 * `List(a,b)`, `(start:(year:2026,...))`. Parentheses and commas are syntax,
 * and only the URNs inside them are encoded. `URLSearchParams` would encode
 * everything and LinkedIn would answer "Invalid query parameters passed to
 * request", so the query string is assembled by hand.
 */
export class LinkedInClient {
  constructor(private readonly transport: LinkedInTransport) {}

  get apiVersion(): string {
    return this.transport.version;
  }

  /* Accounts */

  async searchAdAccounts(
    options: { status?: string[]; ids?: string[]; test?: boolean; pageSize?: number; pageToken?: string } = {},
  ): Promise<LinkedInPage<LinkedInAdAccount>> {
    const criteria: string[] = [];
    if (options.status?.length) criteria.push(`status:(values:${plainList(options.status)})`);
    if (options.ids?.length) criteria.push(`id:(values:${plainList(options.ids.map(accountId))})`);
    if (options.test !== undefined) criteria.push(`test:${options.test}`);
    return this.get("/adAccounts", {
      q: "search",
      ...(criteria.length > 0 ? { search: `(${criteria.join(",")})` } : {}),
      pageSize: options.pageSize ?? 100,
      pageToken: options.pageToken,
    });
  }

  async getAdAccount(id: string): Promise<LinkedInAdAccount> {
    return this.get(`/adAccounts/${accountId(id)}`, {});
  }

  async getAdAccountUsers(id: string): Promise<LinkedInPage<Record<string, unknown>>> {
    return this.get("/adAccountUsers", {
      q: "accounts",
      accounts: urnList([accountUrn(id)]),
    });
  }

  /* Ad entities */

  async searchCampaignGroups(
    id: string,
    options: { status?: string[]; name?: string[]; test?: boolean; pageSize?: number; pageToken?: string } = {},
  ): Promise<LinkedInPage<LinkedInCampaignGroup>> {
    return this.get(`/adAccounts/${accountId(id)}/adCampaignGroups`, {
      q: "search",
      ...searchClause(options),
      sortOrder: "DESCENDING",
      pageSize: options.pageSize ?? 100,
      pageToken: options.pageToken,
    });
  }

  async searchCampaigns(
    id: string,
    options: {
      status?: string[];
      type?: string[];
      name?: string[];
      test?: boolean;
      pageSize?: number;
      pageToken?: string;
    } = {},
  ): Promise<LinkedInPage<LinkedInCampaign>> {
    return this.get(`/adAccounts/${accountId(id)}/adCampaigns`, {
      q: "search",
      ...searchClause(options),
      sortOrder: "DESCENDING",
      pageSize: options.pageSize ?? 100,
      pageToken: options.pageToken,
    });
  }

  async searchCreatives(
    id: string,
    options: {
      campaigns?: string[];
      intendedStatuses?: string[];
      pageSize?: number;
      pageToken?: string;
    } = {},
  ): Promise<LinkedInPage<LinkedInCreative>> {
    return this.get(
      `/adAccounts/${accountId(id)}/creatives`,
      {
        q: "criteria",
        ...(options.campaigns?.length ? { campaigns: urnList(options.campaigns.map(campaignUrn)) } : {}),
        ...(options.intendedStatuses?.length ? { intendedStatuses: plainList(options.intendedStatuses) } : {}),
        sortOrder: "DESCENDING",
        // The creatives finder accepts at most 100 entities per page.
        pageSize: Math.min(options.pageSize ?? 100, 100),
        pageToken: options.pageToken,
      },
      // The creatives finder is the only ads finder that requires the Rest.li
      // method in a header.
      { "X-RestLi-Method": "FINDER" },
    );
  }

  /* Analytics */

  async analytics(params: {
    pivot?: string;
    pivots?: string[];
    dateRange: LinkedInDateRange;
    timeGranularity: string;
    fields: string[];
    accounts?: string[];
    campaigns?: string[];
    campaignGroups?: string[];
    creatives?: string[];
    shares?: string[];
    campaignType?: string;
    objectiveType?: string;
    sortField?: string;
    sortOrder?: string;
  }): Promise<LinkedInPage<LinkedInAnalyticsRow>> {
    const query: Record<string, string | number | undefined> = {
      q: params.pivots ? "statistics" : "analytics",
      dateRange: dateRange(params.dateRange),
      timeGranularity: params.timeGranularity,
      fields: params.fields.join(","),
    };
    if (params.pivots) query.pivots = plainList(params.pivots);
    else if (params.pivot) query.pivot = params.pivot;
    if (params.accounts?.length) query.accounts = urnList(params.accounts.map(accountUrn));
    if (params.campaigns?.length) query.campaigns = urnList(params.campaigns.map(campaignUrn));
    if (params.campaignGroups?.length) query.campaignGroups = urnList(params.campaignGroups.map(campaignGroupUrn));
    if (params.creatives?.length) query.creatives = urnList(params.creatives.map(creativeUrn));
    if (params.shares?.length) query.shares = urnList(params.shares);
    if (params.campaignType) query.campaignType = params.campaignType;
    if (params.objectiveType) query.objectiveType = params.objectiveType;
    if (params.sortField) {
      query["sortBy.field"] = params.sortField;
      query["sortBy.order"] = params.sortOrder ?? "DESCENDING";
    }
    return this.get("/adAnalytics", query);
  }

  async revenueAttribution(params: {
    account: string;
    pivots: string[];
    dateRange: LinkedInDateRange;
    campaigns?: string[];
    campaignGroups?: string[];
  }): Promise<LinkedInPage<LinkedInAnalyticsRow>> {
    return this.get("/adAnalytics", {
      q: "attributedRevenueMetrics",
      account: encodeURIComponent(accountUrn(params.account)),
      pivots: plainList(params.pivots),
      dateRange: dateRange(params.dateRange),
      fields: "revenueAttributionMetrics,dateRange,pivotValues",
      ...(params.campaigns?.length ? { campaigns: urnList(params.campaigns.map(campaignUrn)) } : {}),
      ...(params.campaignGroups?.length ? { campaignGroups: urnList(params.campaignGroups.map(campaignGroupUrn)) } : {}),
    });
  }

  /* Targeting */

  async targetingEntities(params: {
    finder: "adTargetingFacet" | "typeahead" | "similarEntities" | "urns";
    facet?: string;
    query?: string;
    entities?: string[];
    urns?: string[];
    entityType?: string;
    locale?: { language: string; country: string };
  }): Promise<LinkedInPage<Record<string, unknown>>> {
    const locale = params.locale ?? { language: "en", country: "US" };
    return this.get("/adTargetingEntities", {
      q: params.finder,
      queryVersion: "QUERY_USES_URNS",
      ...(params.facet ? { facet: encodeURIComponent(params.facet) } : {}),
      ...(params.query ? { query: encodeURIComponent(params.query) } : {}),
      ...(params.entities?.length ? { entities: urnList(params.entities) } : {}),
      ...(params.urns?.length ? { urns: urnList(params.urns) } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      locale: `(language:${locale.language},country:${locale.country})`,
    });
  }

  /* Transport */

  private async get<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const query = buildQuery(params);
    const result = await this.transport.call("GET", `${endpoint}${query ? `?${query}` : ""}`, undefined, extraHeaders);
    return result.data as T;
  }
}

/* Rest.li helpers */

/**
 * Assembles a Rest.li query string.
 *
 * Values arrive already formed: parentheses, commas and colons are syntax and
 * must survive. Only the keys are encoded.
 */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${value}`)
    .join("&");
}

/** `List(a,b)` without encoding: for enumerations, not URNs. */
export function plainList(values: string[]): string {
  return `List(${values.join(",")})`;
}

/** `List(urn%3Ali%3A...)`: inside a list, a URN is encoded. */
export function urnList(values: string[]): string {
  return `List(${values.map((v) => encodeURIComponent(v)).join(",")})`;
}

export function dateRange(range: LinkedInDateRange): string {
  const part = (d: { year: number; month: number; day: number }) => `(year:${d.year},month:${d.month},day:${d.day})`;
  return range.end ? `(start:${part(range.start)},end:${part(range.end)})` : `(start:${part(range.start)})`;
}

function searchClause(options: { status?: string[]; type?: string[]; name?: string[]; test?: boolean }): Record<string, string> {
  const criteria: string[] = [];
  if (options.status?.length) criteria.push(`status:(values:${plainList(options.status)})`);
  if (options.type?.length) criteria.push(`type:(values:${plainList(options.type)})`);
  if (options.name?.length) {
    criteria.push(`name:(values:${plainList(options.name.map((n) => encodeURIComponent(n)))})`);
  }
  if (options.test !== undefined) criteria.push(`test:${options.test}`);
  return criteria.length > 0 ? { search: `(${criteria.join(",")})` } : {};
}

/** Accepts "512352200" as well as "urn:li:sponsoredAccount:512352200". */
export function accountId(value: string): string {
  return String(value).replace(/^urn:li:sponsoredAccount:/, "").trim();
}

export function accountUrn(value: string): string {
  return `urn:li:sponsoredAccount:${accountId(value)}`;
}

export function campaignUrn(value: string): string {
  return `urn:li:sponsoredCampaign:${String(value).replace(/^urn:li:sponsoredCampaign:/, "").trim()}`;
}

export function campaignGroupUrn(value: string): string {
  return `urn:li:sponsoredCampaignGroup:${String(value).replace(/^urn:li:sponsoredCampaignGroup:/, "").trim()}`;
}

export function creativeUrn(value: string): string {
  return `urn:li:sponsoredCreative:${String(value).replace(/^urn:li:sponsoredCreative:/, "").trim()}`;
}

/** The bare ID of a LinkedIn URN, whatever its type. */
export function urnId(value: string): string {
  const parts = String(value).split(":");
  return parts.length > 1 ? parts[parts.length - 1]! : String(value);
}

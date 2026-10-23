// ============================================
// LINKEDIN ADS DIMENSION CATALOG
// The adAnalytics pivots, plus the time granularities.
// ============================================

import type { LinkedInDimensionDefinition } from "./types.js";

/**
 * A professional demographic pivot cannot be requested on the `analytics`
 * finder without an entity facet: LinkedIn needs to know which scope to split.
 * The query planner relies on this to refuse an empty request instead of
 * returning a table without rows.
 */
const DEMOGRAPHIC: LinkedInDimensionDefinition[] = [
  {
    key: "memberCompany",
    name: "Member company",
    description: "Groups results by the company members work for. Results can include companies that were never targeted, because members change jobs and hold several roles.",
    category: "demographic",
    apiField: "MEMBER_COMPANY",
  },
  {
    key: "memberCompanySize",
    name: "Member company size",
    description: "Groups results by the headcount band of the member employer.",
    category: "demographic",
    apiField: "MEMBER_COMPANY_SIZE",
  },
  {
    key: "memberIndustry",
    name: "Member industry",
    description: "Groups results by the industry of the member employer.",
    category: "demographic",
    apiField: "MEMBER_INDUSTRY",
  },
  {
    key: "memberSeniority",
    name: "Member seniority",
    description: "Groups results by member seniority level.",
    category: "demographic",
    apiField: "MEMBER_SENIORITY",
  },
  {
    key: "memberJobTitle",
    name: "Member job title",
    description: "Groups results by standardised job title. Only the top 100 titles per creative per day are returned.",
    category: "demographic",
    apiField: "MEMBER_JOB_TITLE",
  },
  {
    key: "memberJobFunction",
    name: "Member job function",
    description: "Groups results by job function.",
    category: "demographic",
    apiField: "MEMBER_JOB_FUNCTION",
  },
  {
    key: "memberCountry",
    name: "Member country",
    description: "Groups results by member country, using the Bing location dataset. Values come back as geo URNs.",
    category: "demographic",
    apiField: "MEMBER_COUNTRY_V2",
  },
  {
    key: "memberRegion",
    name: "Member region",
    description: "Groups results by member region, using the Bing location dataset. Values come back as geo URNs.",
    category: "demographic",
    apiField: "MEMBER_REGION_V2",
  },
  {
    key: "memberCounty",
    name: "Member county",
    description: "Groups results by member county, using the Bing location dataset. Values come back as geo URNs.",
    category: "demographic",
    apiField: "MEMBER_COUNTY",
  },
];

const ENTITY: LinkedInDimensionDefinition[] = [
  {
    key: "account",
    name: "Account",
    description: "Groups results by sponsored ad account.",
    category: "entity",
    apiField: "ACCOUNT",
    requiredLevel: "ACCOUNT",
  },
  {
    key: "campaignGroup",
    name: "Campaign group",
    description: "Groups results by campaign group.",
    category: "entity",
    apiField: "CAMPAIGN_GROUP",
    requiredLevel: "CAMPAIGN_GROUP",
  },
  {
    key: "campaign",
    name: "Campaign",
    description: "Groups results by campaign.",
    category: "entity",
    apiField: "CAMPAIGN",
    requiredLevel: "CAMPAIGN",
  },
  {
    key: "creative",
    name: "Creative",
    description: "Groups results by creative, which is the ad itself on LinkedIn.",
    category: "entity",
    apiField: "CREATIVE",
    requiredLevel: "CREATIVE",
  },
  {
    key: "company",
    name: "Advertiser company",
    description: "Groups results by the advertiser own company, not by the company members work for.",
    category: "entity",
    apiField: "COMPANY",
  },
  {
    key: "share",
    name: "Sponsored share",
    description: "Groups results by the sponsored share behind the creative.",
    category: "entity",
    apiField: "SHARE",
  },
  {
    key: "conversion",
    name: "Conversion",
    description: "Groups results by conversion rule. Reach metrics are not available with this pivot.",
    category: "entity",
    apiField: "CONVERSION",
  },
];

const DELIVERY: LinkedInDimensionDefinition[] = [
  {
    key: "servingLocation",
    name: "Serving location",
    description: "Groups results by onsite or offsite delivery. UNKNOWN means the location could not be determined.",
    category: "delivery",
    apiField: "SERVING_LOCATION",
  },
  {
    key: "placementName",
    name: "Placement",
    description: "Groups results by placement. UNKNOWN means the placement could not be determined.",
    category: "delivery",
    apiField: "PLACEMENT_NAME",
  },
  {
    key: "impressionDeviceType",
    name: "Impression device type",
    description: "Groups results by the device the ad was shown on. Reach and conversion metrics are not available with this pivot.",
    category: "delivery",
    apiField: "IMPRESSION_DEVICE_TYPE",
    incompatibleWith: ["approximateMemberReach", "externalWebsiteConversions"],
  },
  {
    key: "eventStage",
    name: "Event stage",
    description: "Groups results by the stage of a LinkedIn live event: PRE_LIVE, LIVE or POST_LIVE.",
    category: "delivery",
    apiField: "EVENT_STAGE",
  },
];

const CREATIVE: LinkedInDimensionDefinition[] = [
  {
    key: "cardIndex",
    name: "Carousel card index",
    description: "Groups results by the position of a card inside a carousel creative, as it was when the member acted.",
    category: "creative",
    apiField: "CARD_INDEX",
  },
  {
    key: "conversationNode",
    name: "Conversation node",
    description: "One row per node of a conversation ad tree.",
    category: "creative",
    apiField: "CONVERSATION_NODE",
  },
  {
    key: "conversationNodeOptionIndex",
    name: "Conversation node option",
    description: "Splits action clicks down to the individual button of a conversation ad node.",
    category: "creative",
    apiField: "CONVERSATION_NODE_OPTION_INDEX",
  },
];

const TIME: LinkedInDimensionDefinition[] = [
  {
    key: "timeGranularityAll",
    name: "Whole period",
    description: "One row for the entire date range. Passed as timeGranularity, not as a pivot.",
    category: "time",
    apiField: "ALL",
  },
  {
    key: "timeGranularityDaily",
    name: "Day",
    description: "One row per day. Daily data older than six months is rolled up to month boundaries.",
    category: "time",
    apiField: "DAILY",
  },
  {
    key: "timeGranularityMonthly",
    name: "Month",
    description: "One row per month.",
    category: "time",
    apiField: "MONTHLY",
  },
  {
    key: "timeGranularityYearly",
    name: "Year",
    description: "One row per year.",
    category: "time",
    apiField: "YEARLY",
  },
];

export const LINKEDIN_DIMENSION_CATALOG: LinkedInDimensionDefinition[] = [
  ...ENTITY,
  ...DEMOGRAPHIC,
  ...DELIVERY,
  ...CREATIVE,
  ...TIME,
];

/** The values accepted by `pivot` and `pivots`. */
export const LINKEDIN_PIVOTS = LINKEDIN_DIMENSION_CATALOG.filter(
  (d) => d.category !== "time",
).map((d) => d.apiField);

export const LINKEDIN_DEMOGRAPHIC_PIVOTS = DEMOGRAPHIC.map((d) => d.apiField);

export function findDimension(key: string): LinkedInDimensionDefinition | undefined {
  const lower = key.toLowerCase();
  return LINKEDIN_DIMENSION_CATALOG.find(
    (d) => d.key.toLowerCase() === lower || d.apiField.toLowerCase() === lower,
  );
}

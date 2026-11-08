/** The pivots `adAnalytics` accepts, as LinkedIn names them. */
export type LinkedInPivot =
  | "COMPANY"
  | "ACCOUNT"
  | "SHARE"
  | "CAMPAIGN"
  | "CREATIVE"
  | "CAMPAIGN_GROUP"
  | "CONVERSION"
  | "CONVERSATION_NODE"
  | "CONVERSATION_NODE_OPTION_INDEX"
  | "SERVING_LOCATION"
  | "CARD_INDEX"
  | "MEMBER_COMPANY_SIZE"
  | "MEMBER_INDUSTRY"
  | "MEMBER_SENIORITY"
  | "MEMBER_JOB_TITLE"
  | "MEMBER_JOB_FUNCTION"
  | "MEMBER_COUNTRY_V2"
  | "MEMBER_REGION_V2"
  | "MEMBER_COUNTY"
  | "MEMBER_COMPANY"
  | "PLACEMENT_NAME"
  | "IMPRESSION_DEVICE_TYPE"
  | "EVENT_STAGE";

export type LinkedInTimeGranularity = "ALL" | "DAILY" | "MONTHLY" | "YEARLY";

export type LinkedInCampaignType =
  | "TEXT_AD"
  | "SPONSORED_UPDATES"
  | "SPONSORED_INMAILS"
  | "DYNAMIC";

export type LinkedInSortField =
  | "COST_IN_LOCAL_CURRENCY"
  | "IMPRESSIONS"
  | "CLICKS"
  | "ONE_CLICK_LEADS"
  | "OPENS"
  | "SENDS"
  | "EXTERNAL_WEBSITE_CONVERSIONS";

/** The LinkedIn date format: three integers, not an ISO string. */
export interface LinkedInDate {
  year: number;
  month: number;
  day: number;
}

export interface LinkedInDateRange {
  start: LinkedInDate;
  end?: LinkedInDate;
}

export interface LinkedInMoney {
  amount?: string;
  currencyCode?: string;
}

export interface LinkedInPage<T> {
  elements: T[];
  paging?: { start?: number; count?: number; total?: number; links?: unknown[] };
  metadata?: { nextPageToken?: string | null };
}

export interface LinkedInAdAccount {
  id?: number;
  name?: string;
  currency?: string;
  status?: string;
  type?: string;
  test?: boolean;
  reference?: string;
  servingStatuses?: string[];
  [key: string]: unknown;
}

export interface LinkedInCampaignGroup {
  id?: number;
  account?: string;
  name?: string;
  status?: string;
  backfilled?: boolean;
  runSchedule?: { start?: number; end?: number };
  totalBudget?: LinkedInMoney;
  dailyBudget?: LinkedInMoney;
  objectiveType?: string;
  servingStatuses?: string[];
  allowedCampaignTypes?: string[];
  test?: boolean;
  [key: string]: unknown;
}

export interface LinkedInCampaign {
  id?: number;
  account?: string;
  campaignGroup?: string;
  name?: string;
  status?: string;
  type?: LinkedInCampaignType;
  format?: string;
  costType?: string;
  objectiveType?: string;
  optimizationTargetType?: string;
  pacingStrategy?: string;
  offsiteDeliveryEnabled?: boolean;
  audienceExpansionEnabled?: boolean;
  creativeSelection?: string;
  locale?: { country?: string; language?: string };
  runSchedule?: { start?: number; end?: number };
  dailyBudget?: LinkedInMoney;
  totalBudget?: LinkedInMoney;
  unitCost?: LinkedInMoney;
  targetingCriteria?: Record<string, unknown>;
  servingStatuses?: string[];
  associatedEntity?: string;
  test?: boolean;
  [key: string]: unknown;
}

export interface LinkedInCreative {
  id?: string;
  campaign?: string;
  account?: string;
  intendedStatus?: string;
  isServing?: boolean;
  servingHoldReasons?: string[];
  review?: { status?: string; rejectionReasons?: string[] };
  content?: Record<string, unknown>;
  createdAt?: number;
  lastModifiedAt?: number;
  [key: string]: unknown;
}

/** One `adAnalytics` row. Metrics sit flat on the object. */
export type LinkedInAnalyticsRow = Record<string, unknown> & {
  dateRange?: LinkedInDateRange;
  pivotValues?: string[];
};

export interface LinkedInAudienceCount {
  active?: number;
  total?: number;
}

export interface LinkedInTargetingFacet {
  facetName?: string;
  adTargetingFacetUrn?: string;
  entityTypes?: string[];
  availableEntityFinders?: string[];
}

export interface LinkedInTargetingEntity {
  urn?: string;
  facetUrn?: string;
  name?: string;
  description?: string;
  isTargetable?: boolean;
  value?: unknown;
}

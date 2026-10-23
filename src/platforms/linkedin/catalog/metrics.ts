// ============================================
// LINKEDIN ADS METRIC CATALOG
// Fields of the adAnalytics endpoint, version 202608, plus the ratios that
// LinkedIn does not return and that this server computes.
// ============================================

import type { LinkedInMetricDefinition } from "./types.js";

/** The professional demographic pivots, for which LinkedIn drops some fields. */
const DEMOGRAPHIC_PIVOTS = [
  "MEMBER_COMPANY",
  "MEMBER_COMPANY_SIZE",
  "MEMBER_COUNTRY_V2",
  "MEMBER_COUNTY",
  "MEMBER_INDUSTRY",
  "MEMBER_JOB_FUNCTION",
  "MEMBER_JOB_TITLE",
  "MEMBER_REGION_V2",
  "MEMBER_SENIORITY",
];

/** Shorthand: an API metric whose key is the LinkedIn field name. */
function api(
  key: string,
  name: string,
  description: string,
  category: LinkedInMetricDefinition["category"],
  format: LinkedInMetricDefinition["format"] = "number",
  incompatibleWith?: string[],
): LinkedInMetricDefinition {
  return { key, name, description, category, format, apiField: key, type: "api", ...(incompatibleWith ? { incompatibleWith } : {}) };
}

const CORE: LinkedInMetricDefinition[] = [
  api("impressions", "Impressions", "Count of impressions for Sponsored Content, and of sends for Sponsored Messaging.", "core"),
  api("clicks", "Clicks", "Count of chargeable clicks. On a CPM campaign these are still counted, they are simply not charged.", "core"),
  api("costInLocalCurrency", "Cost (account currency)", "Spend in the currency of the ad account, for the requested pivot and granularity.", "spend", "currency"),
  api("costInUsd", "Cost (USD)", "Spend converted to US dollars, for the requested pivot and granularity.", "spend", "currency"),
  api("approximateMemberReach", "Approximate member reach", "Estimated number of unique member accounts with at least one impression. Returned only for date ranges of 92 days or less.", "reach", "number", DEMOGRAPHIC_PIVOTS),
  api("audiencePenetration", "Audience penetration", "Members reached divided by the estimated total target audience. Null beyond a 92 day range, and only with an ACCOUNT, CAMPAIGN_GROUP or CAMPAIGN pivot.", "reach", "percentage"),
  api("averageDwellTime", "Average dwell time", "Average time in seconds during which more than half of the ad pixels stayed in the viewport.", "engagement", "duration"),
];

const ENGAGEMENT: LinkedInMetricDefinition[] = [
  api("totalEngagements", "Total engagements", "Count of every user interaction with the ad unit.", "engagement"),
  api("otherEngagements", "Other engagements", "Interactions with the ad unit that fit no more specific category.", "engagement"),
  api("landingPageClicks", "Landing page clicks", "Clicks that take the member to the creative landing page.", "engagement"),
  api("companyPageClicks", "Company page clicks", "Clicks through to the advertiser company page.", "engagement"),
  api("reactions", "Reactions", "Positive reactions on Sponsored Content: like, interest, praise and the rest.", "engagement"),
  api("likes", "Likes", "Count of likes. Sponsored Content only.", "engagement"),
  api("comments", "Comments", "Count of comments. Sponsored Content only.", "engagement"),
  api("commentLikes", "Comment likes", "Count of likes on comments. Sponsored Content only.", "engagement"),
  api("shares", "Shares", "Count of shares. Sponsored Content only.", "engagement"),
  api("follows", "Follows", "Count of follows. Sponsored Content and Follower ads only.", "engagement"),
  api("subscriptionClicks", "Subscription clicks", "Clicks to subscribe to a series such as a newsletter.", "engagement"),
  api("downloadClicks", "Download clicks", "Times members clicked the download icon on the ad media. A click is an intent to download, not a completed one.", "engagement"),
  api("cardClicks", "Card clicks", "Clicks on each card of a carousel ad.", "engagement", "number", DEMOGRAPHIC_PIVOTS),
  api("cardImpressions", "Card impressions", "Impressions of each card of a carousel ad.", "engagement", "number", DEMOGRAPHIC_PIVOTS),
  api("headlineClicks", "Headline clicks", "Times members clicked the headline of a conversation ad.", "engagement"),
  api("headlineImpressions", "Headline impressions", "Times members were shown the headline of a conversation ad.", "engagement"),
  api("fullScreenPlays", "Full screen plays", "Times members switched the video to full screen.", "video"),
];

const MESSAGING: LinkedInMetricDefinition[] = [
  api("sends", "Sends", "Count of Sponsored Messaging ads sent.", "messaging"),
  api("opens", "Opens", "Count of Sponsored Messaging ads opened.", "messaging"),
  api("actionClicks", "Action clicks", "Clicks on the action button of a Sponsored Messaging ad.", "messaging"),
  api("adUnitClicks", "Ad unit clicks", "Clicks on the ad unit displayed alongside a Sponsored Messaging ad.", "messaging"),
  api("textUrlClicks", "Text URL clicks", "Clicks on links inside the body of a Sponsored Messaging ad.", "messaging"),
  api("leadGenerationMailContactInfoShares", "InMail contact info shares", "Times members shared contact details through One Click Lead Gen on Sponsored Messaging.", "lead"),
  api("leadGenerationMailInterestedClicks", "InMail interested clicks", "Sponsored Messaging recipients who clicked to signal interest.", "lead"),
];

const VIDEO: LinkedInMetricDefinition[] = [
  api("videoStarts", "Video starts", "Count of video ads started by members.", "video"),
  api("videoViews", "Video views", "A video playing at least 2 continuous seconds at 50 percent in view, or a click on the call to action.", "video"),
  api("videoFirstQuartileCompletions", "Video 25 percent", "Video ads played through the first quartile.", "video"),
  api("videoMidpointCompletions", "Video 50 percent", "Video ads played through the midpoint.", "video"),
  api("videoThirdQuartileCompletions", "Video 75 percent", "Video ads played through the third quartile.", "video"),
  api("videoCompletions", "Video completions", "Video ads played to between 97 and 100 percent.", "video"),
  api("videoWatchTime", "Video watch time", "Total watch time in milliseconds. This metric can lag by up to 48 hours.", "video", "duration"),
  api("averageVideoWatchTime", "Average video watch time", "Average watch time in milliseconds. This metric can lag by up to 48 hours.", "video", "duration"),
];

const DOCUMENT: LinkedInMetricDefinition[] = [
  api("documentFirstQuartileCompletions", "Document 25 percent", "Times members reached the first quartile of a document ad, including skips.", "document"),
  api("documentMidpointCompletions", "Document 50 percent", "Times members reached the second quartile of a document ad, including skips.", "document"),
  api("documentThirdQuartileCompletions", "Document 75 percent", "Times members reached the third quartile of a document ad, including skips.", "document"),
  api("documentCompletions", "Document completions", "Times members reached the end of a document ad, including skips.", "document"),
];

const EVENT: LinkedInMetricDefinition[] = [
  api("eventViews", "Event views", "Valid views of an event hosted on LinkedIn.", "event"),
  api("eventViewsOver15Seconds", "Event views over 15s", "Event views by members who watched more than 15 seconds.", "event"),
  api("eventViewsOver30Seconds", "Event views over 30s", "Event views by members who watched more than 30 seconds.", "event"),
  api("eventViewsOver2Minutes", "Event views over 2min", "Event views by members who watched more than 2 minutes.", "event"),
  api("eventWatchTime", "Event watch time", "Total watch time of the event in milliseconds.", "event", "duration"),
  api("averageEventWatchTime", "Average event watch time", "Average watch time of the event in milliseconds.", "event", "duration"),
  api("averageEventWatchTimeOver15Seconds", "Average event watch time over 15s", "Average watch time in milliseconds among members who watched more than 15 seconds.", "event", "duration"),
  api("averageEventWatchTimeOver30Seconds", "Average event watch time over 30s", "Average watch time in milliseconds among members who watched more than 30 seconds.", "event", "duration"),
  api("averageEventWatchTimeOver2Minutes", "Average event watch time over 2min", "Average watch time in milliseconds among members who watched more than 2 minutes.", "event", "duration"),
  api("costPerEventView", "Cost per event view", "Cost per view of an event hosted on LinkedIn.", "event", "currency"),
  api("costPerEventViewOver15Seconds", "Cost per event view over 15s", "Cost per event view among members who watched more than 15 seconds.", "event", "currency"),
  api("costPerEventViewOver30Seconds", "Cost per event view over 30s", "Cost per event view among members who watched more than 30 seconds.", "event", "currency"),
  api("costPerEventViewOver2Minutes", "Cost per event view over 2min", "Cost per event view among members who watched more than 2 minutes.", "event", "currency"),
];

const CONVERSION: LinkedInMetricDefinition[] = [
  api("externalWebsiteConversions", "Website conversions", "Times members took the tracked action after clicking or seeing the ad.", "conversion"),
  api("externalWebsitePostClickConversions", "Post click conversions", "Times members took the tracked action after clicking the ad.", "conversion"),
  api("externalWebsitePostViewConversions", "Post view conversions", "Times members took the tracked action after seeing the ad.", "conversion"),
  api("conversionValueInLocalCurrency", "Conversion value", "Value of the conversions in the account currency, using the values the advertiser set per conversion.", "conversion", "currency", DEMOGRAPHIC_PIVOTS),
  api("registrations", "Registrations", "Event or seminar registrations after viewing or clicking an ad with a LinkedIn event landing page. Gross count, unregistrations are not deducted.", "conversion"),
  api("postClickRegistrations", "Post click registrations", "Event registrations after clicking an ad with a LinkedIn landing page.", "conversion"),
  api("postViewRegistrations", "Post view registrations", "Event registrations after viewing an ad with a LinkedIn event landing page.", "conversion"),
];

const LEAD: LinkedInMetricDefinition[] = [
  api("oneClickLeads", "One click leads", "Leads generated through One Click Lead Gen.", "lead"),
  api("oneClickLeadFormOpens", "Lead form opens", "Times members opened the lead form of a One Click Lead Gen campaign.", "lead"),
  api("qualifiedLeads", "Qualified leads", "Leads the advertiser flagged as more likely to become a customer.", "lead"),
  api("costPerQualifiedLead", "Cost per qualified lead", "Spend in the account currency divided by qualified leads.", "lead", "currency"),
  api("validWorkEmailLeads", "Valid work email leads", "Leads whose email is not on a known free or personal domain.", "lead"),
  api("talentLeads", "Talent leads", "Leads captured through a talent media campaign.", "lead"),
  api("appointmentsScheduled", "Appointments scheduled", "Appointments booked through Lead Gen campaigns. Available from API version 202605 onwards.", "lead"),
];

const JOBS: LinkedInMetricDefinition[] = [
  api("jobApplications", "Job applications", "Job applications completed after viewing or clicking an ad.", "job"),
  api("postClickJobApplications", "Post click job applications", "Job applications completed after clicking an ad.", "job"),
  api("postViewJobApplications", "Post view job applications", "Job applications completed after viewing an ad.", "job"),
  api("jobApplyClicks", "Job apply clicks", "Clicks on the apply button of a LinkedIn job page after viewing or clicking an ad.", "job"),
  api("postClickJobApplyClicks", "Post click job apply clicks", "Clicks on the apply button after clicking an ad.", "job"),
  api("postViewJobApplyClicks", "Post view job apply clicks", "Clicks on the apply button after viewing an ad.", "job"),
];

/**
 * Viral metrics.
 *
 * A viral impression comes from a member who reshares the sponsored content to
 * their own network. It is not counted in `impressions`, so reporting only
 * `impressions` understates the organic reach the campaign paid for.
 */
const VIRAL: LinkedInMetricDefinition[] = [
  api("viralImpressions", "Viral impressions", "Impressions coming from members resharing the sponsored content to their own network. Not counted inside impressions.", "viral"),
  api("viralClicks", "Viral clicks", "Clicks on viral impressions. Sponsored Content only.", "viral"),
  api("viralLandingPageClicks", "Viral landing page clicks", "Clicks on viral impressions that take the member to the landing page.", "viral"),
  api("viralCompanyPageClicks", "Viral company page clicks", "Clicks through to the company page from viral impressions.", "viral"),
  api("viralTotalEngagements", "Viral total engagements", "Every interaction with a viral ad unit.", "viral"),
  api("viralOtherEngagements", "Viral other engagements", "Viral interactions that fit no more specific category.", "viral"),
  api("viralReactions", "Viral reactions", "Positive reactions on viral Sponsored Content.", "viral"),
  api("viralLikes", "Viral likes", "Likes from viral impressions.", "viral"),
  api("viralComments", "Viral comments", "Comments from viral impressions.", "viral"),
  api("viralCommentLikes", "Viral comment likes", "Likes on comments from viral impressions.", "viral"),
  api("viralShares", "Viral shares", "Shares from viral impressions.", "viral"),
  api("viralFollows", "Viral follows", "Follows from viral impressions.", "viral"),
  api("viralSubscriptionClicks", "Viral subscription clicks", "Viral clicks to subscribe to a series such as a newsletter.", "viral"),
  api("viralDownloadClicks", "Viral download clicks", "Download intents on a viral ad.", "viral"),
  api("viralFullScreenPlays", "Viral full screen plays", "Times members switched a viral video to full screen.", "viral"),
  api("viralCardClicks", "Viral card clicks", "Viral clicks on each card of a carousel ad.", "viral", "number", DEMOGRAPHIC_PIVOTS),
  api("viralCardImpressions", "Viral card impressions", "Viral impressions of each card of a carousel ad.", "viral", "number", DEMOGRAPHIC_PIVOTS),
  api("viralVideoStarts", "Viral video starts", "Viral video ads started by members.", "viral"),
  api("viralVideoViews", "Viral video views", "A viral video playing at least 2 continuous seconds at 50 percent in view, or a click on the call to action.", "viral"),
  api("viralVideoFirstQuartileCompletions", "Viral video 25 percent", "Viral video ads played through the first quartile.", "viral"),
  api("viralVideoMidpointCompletions", "Viral video 50 percent", "Viral video ads played through the midpoint.", "viral"),
  api("viralVideoThirdQuartileCompletions", "Viral video 75 percent", "Viral video ads played through the third quartile.", "viral"),
  api("viralVideoCompletions", "Viral video completions", "Viral video ads played to between 97 and 100 percent.", "viral"),
  api("viralDocumentFirstQuartileCompletions", "Viral document 25 percent", "Times members reached the first quartile of a document ad on a viral post.", "viral"),
  api("viralDocumentMidpointCompletions", "Viral document 50 percent", "Times members reached the second quartile of a document ad on a viral post.", "viral"),
  api("viralDocumentThirdQuartileCompletions", "Viral document 75 percent", "Times members reached the third quartile of a document ad on a viral post.", "viral"),
  api("viralDocumentCompletions", "Viral document completions", "Times members reached the end of a document ad on a viral post.", "viral"),
  api("viralExternalWebsiteConversions", "Viral website conversions", "Conversions attributed to a viral event.", "viral"),
  api("viralExternalWebsitePostClickConversions", "Viral post click conversions", "Post click conversions attributed to a viral click.", "viral"),
  api("viralExternalWebsitePostViewConversions", "Viral post view conversions", "Post view conversions attributed to a viral impression.", "viral"),
  api("viralOneClickLeads", "Viral one click leads", "Leads generated through One Click Lead Gen from viral impressions.", "viral"),
  api("viralOneClickLeadFormOpens", "Viral lead form opens", "Lead form opens from viral impressions.", "viral"),
  api("viralRegistrations", "Viral registrations", "Event registrations after viewing or clicking a viral ad.", "viral"),
  api("viralPostClickRegistrations", "Viral post click registrations", "Event registrations after clicking a viral ad.", "viral"),
  api("viralPostViewRegistrations", "Viral post view registrations", "Event registrations after viewing a viral ad.", "viral"),
  api("viralJobApplications", "Viral job applications", "Job applications after viewing or clicking a viral ad.", "viral"),
  api("viralPostClickJobApplications", "Viral post click job applications", "Job applications after clicking a viral ad.", "viral"),
  api("viralPostViewJobApplications", "Viral post view job applications", "Job applications after viewing a viral ad.", "viral"),
  api("viralJobApplyClicks", "Viral job apply clicks", "Clicks on the apply button after viewing or clicking a viral ad.", "viral"),
  api("viralPostClickJobApplyClicks", "Viral post click job apply clicks", "Clicks on the apply button after clicking a viral ad.", "viral"),
  api("viralPostViewJobApplyClicks", "Viral post view job apply clicks", "Clicks on the apply button after viewing a viral ad.", "viral"),
];

/**
 * Revenue attribution, returned only by the `attributedRevenueMetrics` finder
 * and only when a CRM is connected to the Business Manager.
 */
const REVENUE: LinkedInMetricDefinition[] = [
  { key: "revenueWonInUsd", name: "Revenue won (USD)", description: "CRM revenue in US dollars attributed to LinkedIn advertising. Requires a CRM connected to Business Manager.", category: "revenue", format: "currency", apiField: "revenueAttributionMetrics.revenueWonInUsd", type: "api" },
  { key: "returnOnAdSpend", name: "Return on ad spend", description: "Attributed revenue won divided by LinkedIn ad spend.", category: "revenue", format: "ratio", apiField: "revenueAttributionMetrics.returnOnAdSpend", type: "api" },
  { key: "closedWonOpportunities", name: "Closed won opportunities", description: "CRM opportunities closed as won and attributed to LinkedIn advertising.", category: "revenue", format: "number", apiField: "revenueAttributionMetrics.closedWonOpportunities", type: "api" },
  { key: "openOpportunities", name: "Open opportunities", description: "CRM deals in progress attributed to LinkedIn advertising. Returned only when the date range ends today in UTC.", category: "revenue", format: "number", apiField: "revenueAttributionMetrics.openOpportunities", type: "api" },
  { key: "opportunityAmountInUsd", name: "Open opportunity amount (USD)", description: "Total value of open CRM opportunities attributed to LinkedIn. Returned only when the date range ends today in UTC.", category: "revenue", format: "currency", apiField: "revenueAttributionMetrics.opportunityAmountInUsd", type: "api" },
  { key: "opportunityWinRate", name: "Opportunity win rate", description: "Share of closed opportunities that were won.", category: "revenue", format: "percentage", apiField: "revenueAttributionMetrics.opportunityWinRate", type: "api" },
  { key: "averageDealSizeInUsd", name: "Average deal size (USD)", description: "Revenue won divided by the number of closed won opportunities.", category: "revenue", format: "currency", apiField: "revenueAttributionMetrics.averageDealSizeInUsd", type: "api" },
  { key: "averageDaysToClose", name: "Average days to close", description: "Average number of days between opportunity creation and close.", category: "revenue", format: "number", apiField: "revenueAttributionMetrics.averageDaysToClose", type: "api" },
];

/**
 * What LinkedIn does not return.
 *
 * `adAnalytics` has no CTR, CPC or CPM: Campaign Manager shows them but the API
 * returns the raw terms. This server computes them, and says so, instead of
 * leaving an agent to divide rows that are already aggregated by pivot.
 */
const CALCULATED: LinkedInMetricDefinition[] = [
  { key: "ctr", name: "Click through rate", description: "Clicks divided by impressions. LinkedIn does not return this field, this server computes it.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "clicks / impressions", dependencies: ["clicks", "impressions"] },
  { key: "cpc", name: "Cost per click", description: "Spend in the account currency divided by clicks. Computed by this server.", category: "calculated", format: "currency", apiField: "", type: "calculated", formula: "costInLocalCurrency / clicks", dependencies: ["costInLocalCurrency", "clicks"] },
  { key: "cpm", name: "Cost per thousand impressions", description: "Spend in the account currency per thousand impressions. Computed by this server.", category: "calculated", format: "currency", apiField: "", type: "calculated", formula: "costInLocalCurrency / impressions * 1000", dependencies: ["costInLocalCurrency", "impressions"] },
  { key: "cpl", name: "Cost per lead", description: "Spend divided by One Click Lead Gen leads. Computed by this server.", category: "calculated", format: "currency", apiField: "", type: "calculated", formula: "costInLocalCurrency / oneClickLeads", dependencies: ["costInLocalCurrency", "oneClickLeads"] },
  { key: "cpa", name: "Cost per conversion", description: "Spend divided by website conversions. Computed by this server.", category: "calculated", format: "currency", apiField: "", type: "calculated", formula: "costInLocalCurrency / externalWebsiteConversions", dependencies: ["costInLocalCurrency", "externalWebsiteConversions"] },
  { key: "conversionRate", name: "Conversion rate", description: "Website conversions divided by clicks. Computed by this server.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "externalWebsiteConversions / clicks", dependencies: ["externalWebsiteConversions", "clicks"] },
  { key: "leadRate", name: "Lead form fill rate", description: "One Click Lead Gen leads divided by lead form opens. Computed by this server.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "oneClickLeads / oneClickLeadFormOpens", dependencies: ["oneClickLeads", "oneClickLeadFormOpens"] },
  { key: "engagementRate", name: "Engagement rate", description: "Total engagements divided by impressions. Computed by this server.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "totalEngagements / impressions", dependencies: ["totalEngagements", "impressions"] },
  { key: "videoCompletionRate", name: "Video completion rate", description: "Video completions divided by video starts. Computed by this server.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "videoCompletions / videoStarts", dependencies: ["videoCompletions", "videoStarts"] },
  { key: "costPerVideoView", name: "Cost per video view", description: "Spend divided by video views. Computed by this server.", category: "calculated", format: "currency", apiField: "", type: "calculated", formula: "costInLocalCurrency / videoViews", dependencies: ["costInLocalCurrency", "videoViews"] },
  { key: "roas", name: "Return on ad spend (conversion value)", description: "Conversion value divided by spend, both in the account currency. Computed by this server, and unrelated to the CRM based returnOnAdSpend.", category: "calculated", format: "ratio", apiField: "", type: "calculated", formula: "conversionValueInLocalCurrency / costInLocalCurrency", dependencies: ["conversionValueInLocalCurrency", "costInLocalCurrency"] },
  { key: "openRate", name: "Sponsored Messaging open rate", description: "Opens divided by sends. Computed by this server.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "opens / sends", dependencies: ["opens", "sends"] },
  { key: "viralShareOfImpressions", name: "Viral share of impressions", description: "Viral impressions divided by paid plus viral impressions. Computed by this server.", category: "calculated", format: "percentage", apiField: "", type: "calculated", formula: "viralImpressions / (impressions + viralImpressions)", dependencies: ["viralImpressions", "impressions"] },
  { key: "frequency", name: "Frequency", description: "Impressions divided by approximate member reach. Only meaningful on a date range of 92 days or less, where LinkedIn returns reach.", category: "calculated", format: "ratio", apiField: "", type: "calculated", formula: "impressions / approximateMemberReach", dependencies: ["impressions", "approximateMemberReach"] },
];

export const LINKEDIN_METRIC_CATALOG: LinkedInMetricDefinition[] = [
  ...CORE,
  ...ENGAGEMENT,
  ...MESSAGING,
  ...VIDEO,
  ...DOCUMENT,
  ...EVENT,
  ...CONVERSION,
  ...LEAD,
  ...JOBS,
  ...VIRAL,
  ...REVENUE,
  ...CALCULATED,
];

/** The `fields` values LinkedIn actually accepts, by exact name. */
export const LINKEDIN_API_METRICS = new Set(
  LINKEDIN_METRIC_CATALOG.filter((m) => m.type === "api" && !m.apiField.includes(".")).map((m) => m.apiField),
);

export const LINKEDIN_CALCULATED_METRICS = LINKEDIN_METRIC_CATALOG.filter(
  (m) => m.type === "calculated",
);

export function findMetric(key: string): LinkedInMetricDefinition | undefined {
  const lower = key.toLowerCase();
  return LINKEDIN_METRIC_CATALOG.find(
    (m) => m.key.toLowerCase() === lower || m.apiField.toLowerCase() === lower,
  );
}

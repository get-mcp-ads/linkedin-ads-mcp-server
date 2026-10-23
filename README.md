<div align="center">

# LinkedIn Ads MCP server

### Bring your LinkedIn Ads accounts into your MCP client.

Read campaign structure, performance and professional demographics, and prepare draft campaigns and ads for explicitly selected accounts.

[![Release](https://img.shields.io/github/v/release/get-mcp-ads/linkedin-ads-mcp-server?color=2448e5)](https://github.com/get-mcp-ads/linkedin-ads-mcp-server/releases/latest)
[![CI](https://github.com/get-mcp-ads/linkedin-ads-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/get-mcp-ads/linkedin-ads-mcp-server/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.23.4%2B%20%7C%2024.22.1%2B%20%7C%2026.12.1%2B-brightgreen.svg)](package.json)

[Watch the film](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4) · [What's new](#whats-new) · [Install](#install-this-release) · [Tool reference](#tools) · [Try hosted getmcpads](https://www.getmcpads.com/tools/linkedin-ads?utm_source=github&utm_medium=readme&utm_campaign=linkedin-ads)

[![Watch the getmcpads film: every ad account in one conversation with your AI assistant](https://www.getmcpads.com/home/film/brand-film-poster-promise.webp)](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4)

**[Play the 45-second film](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4)**

</div>

The film shows hosted getmcpads with sample data. Its MCP Apps, from creative galleries and alerts to Google Sheets exports and bulk launches, belong to the hosted product. This repository provides the standalone native API tools.

**18 read tools** · **15 write tools**, disabled by default.

Run locally with your own LinkedIn app credentials and a client that supports stdio MCP, such as Claude Desktop, Claude Code or Cursor. Your requests go directly to the LinkedIn Marketing API. For managed connections, including supported ChatGPT setups, use the hosted option.

## What's new

**[v1.0.0: First standalone release](https://github.com/get-mcp-ads/linkedin-ads-mcp-server/releases/tag/v1.0.0) · October 23, 2026**

- Read ad accounts, campaign groups, campaigns, creatives and the image and video library of each configured account.
- Report through the analytics and statistics finders with a catalog of 139 metrics, including 14 ratios such as CTR, CPC and CPM that LinkedIn does not return and this server computes from the raw terms.
- Break delivery down by company, company size, industry, seniority, job title, job function and location, and read CRM revenue attribution.
- Create campaign groups, campaigns, text ads and sponsored image or video ads as DRAFT, edit and rename them, and upload media through signed receipts. Writes are opt-in and preview first.
- Require explicit account IDs, contact only LinkedIn's API, token and upload endpoints, and never follow a redirect.

[Full changelog](CHANGELOG.md) · [Source synchronization details](SOURCE_SYNC.md) · [All releases](https://github.com/get-mcp-ads/linkedin-ads-mcp-server/releases)

### Upgrade notes

Requires **Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release**. These carry the October 2026 security fixes, and the server prints a warning on stderr when it runs on an older one. CI covers Node 22, 24 and 26.

This is the first release. Hosted creative galleries, campaign launches and MCP Apps UI are outside it.

## Install this release

This is a GitHub source release. npm and MCP Registry versions are published separately. The commands below select this exact version; unpinned `npx` examples later in this document select the version currently available on npm.

```bash
git clone --branch v1.0.0 --depth 1 https://github.com/get-mcp-ads/linkedin-ads-mcp-server.git
cd linkedin-ads-mcp-server
npm ci
npm run build
```

Configure your MCP client to run `node` with the absolute path to `dist/cli.js` and the variables documented below. Once the package is on npm, the client can run `npx -y @getmcpads/linkedin-ads-mcp-server` instead, which starts the `linkedin-ads-mcp` binary.

```json
{
  "mcpServers": {
    "linkedin-ads": {
      "command": "node",
      "args": ["/absolute/path/to/linkedin-ads-mcp-server/dist/cli.js"],
      "env": {
        "LINKEDIN_ADS_ACCESS_TOKEN": "your-member-access-token",
        "LINKEDIN_ADS_ACCOUNT_IDS": "512345678"
      }
    }
  }
}
```

`npm run doctor` reports which variables are set, never their values, and checks the Node.js release.

> **Prefer a managed connection?** [Use LinkedIn Ads with hosted getmcpads](https://www.getmcpads.com/tools/linkedin-ads?utm_source=github&utm_medium=readme&utm_campaign=linkedin-ads). Connect your account, select the data your assistant may access and use the hosted MCP connection. See the site for current features and plans.

## Configuration

Provide these environment variables through the client's secret configuration:

| Variable | Purpose |
|---|---|
| `LINKEDIN_ADS_ACCESS_TOKEN` | Member access token from your own LinkedIn app. Required unless the three refresh variables are set. |
| `LINKEDIN_ADS_REFRESH_TOKEN` | Programmatic refresh token, for apps LinkedIn approved for them. The access token is then renewed in memory. |
| `LINKEDIN_ADS_CLIENT_ID` | Client ID of your app. Used with the refresh token. |
| `LINKEDIN_ADS_CLIENT_SECRET` | Client secret of your app. Used with the refresh token. |
| `LINKEDIN_ADS_ACCOUNT_IDS` | Required. 1 to 100 comma-separated numeric ad account IDs. Every other account is refused before any request, reads included. |
| `LINKEDIN_ADS_SCOPES` | Optional. Scopes actually granted to the token. When set, writes refuse to run without `rw_ads`. Setting it grants nothing. |
| `LINKEDIN_ADS_ENABLE_WRITES` | Defaults to `false`. Only the exact value `true` exposes the write tools. |
| `LINKEDIN_ADS_API_VERSION` | `LinkedIn-Version` header as YYYYMM. Defaults to `202608`, the version the hosted gateway runs. |
| `LINKEDIN_ADS_LOG_LEVEL` | `debug`, `info`, `warn` or `error`. Logs go to stderr. Defaults to `info`. |

The server validates the configuration at startup and names the variable to fix. It runs no OAuth browser flow and writes nothing to disk: a token renewed through the refresh token stays in memory until the process ends.

### What your LinkedIn app needs

LinkedIn Marketing API access is granted per application, so this server runs with an app you own. LinkedIn's [quick start](https://learn.microsoft.com/en-us/linkedin/marketing/quick-start?view=li-lms-2026-10) describes the steps:

1. Create a LinkedIn Page, then a developer application in the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps/new).
2. Request the **Advertising API** product from the app's Products tab and complete the access form. LinkedIn reviews each request.
3. Every application starts on the **Development tier**: reads have no account limit, and edits are limited to five ad accounts you administer. On this tier, add each ad account ID under Products, View Ad Accounts. The **Standard tier** removes the edit limit and is requested through the [Developer Support Portal](https://www.linkedin.com/help/linkedin/ask/dsapi). See [access tiers](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-10#how-to-upgrade-your-access-tier).
4. Generate a member access token with the [Token Generator](https://learn.microsoft.com/en-us/linkedin/shared/authentication/developer-portal-tools), or your own authorization code flow, with the scopes below. Access tokens last 60 days. Apps approved for [programmatic refresh tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens) receive a refresh token valid for a year, which this server can use.

Scopes used by the tools of this server:

| Scope | Needed for |
|---|---|
| `r_ads` | Account, campaign group, campaign, creative and media library reads, and targeting lookup. `rw_ads` also allows these reads. |
| `r_ads_reporting` | `linkedin_get_insights`, `linkedin_run_statistics_report`, `linkedin_get_demographics`, `linkedin_get_revenue_attribution` and the reporting probe of `linkedin_health_check`. |
| `r_organization_social` | `linkedin_list_ad_creatives`, which reads the sponsored post behind each sponsored content ad. |
| `rw_ads` | Every write tool. |
| `w_organization_social` | `linkedin_create_media_ad`, which creates the dark post sponsored by the ad, authored by the Company Page of the ad account. |

LinkedIn roles still decide what the token can do. A `VIEWER` on an ad account can only read, even with `rw_ads`; writes need `ACCOUNT_BILLING_ADMIN`, `ACCOUNT_MANAGER`, `CAMPAIGN_MANAGER` or `CREATIVE_MANAGER` ([account roles](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives?view=li-lms-2026-10#permissions)). Media uploads and sponsored image or video ads belong to the Company Page referenced by the ad account, which needs an administrator or sponsored content poster role on that Page. `linkedin_health_check` lists the configured accounts the token reaches and the ones it does not.

## Safety and coverage

Writes preview by default. Review the exact account, target and parameters before repeating the call with `confirm: true`.
Campaign groups, campaigns and ads are created as DRAFT, and sponsored posts use `feedDistribution: NONE`, so nothing reaches the organic feed. New campaigns keep audience expansion and the LinkedIn Audience Network off. No tool activates delivery: activation, where spend starts, happens in Campaign Manager. A preview flags an edit of budget, bid, schedule or targeting, which can change what an already running campaign spends.
Do not retry a write automatically when its result is uncertain. A failed write reports `verify_before_retry` when a mutation reached LinkedIn and `not_applied` when none did. This server never retries a mutation; reads retry a network error, HTTP 429 or a 5xx at most twice.
Account checks apply before every request. Campaign, group and creative filters are verified against the account before a report, and every write re-reads its account and parent entities. Unknown arguments are rejected.
Requests go only to `api.linkedin.com`, the token endpoint and the signed upload URLs on `www.linkedin.com`, without following redirects, with timeouts and bounded responses. Upload URLs travel inside HMAC-signed receipts that end with the process, and the upload request carries no token. Tokens and secrets are redacted from every result and error.
Budgets and bids are decimal strings in the account currency, such as `"20.00"` with `"EUR"`, not micros or cents. A report needs at least one entity scope, accepts at most 20 fields and is capped at 15,000 rows; the server applies these limits before the call and says when LinkedIn drops a field instead of returning zero.

This server exposes the native LinkedIn tools of the hosted gateway, plus account discovery, a health check and offline query validation. Audience size estimates, bid and supply forecasts, matched audiences, conversion rules, lead form definitions, experiments, Page statistics and generic endpoint reads are not included in this release. Submitted lead data is never exposed.
Use `tools/list` or [server-card.json](server-card.json) for exact schemas and the [Marketing API documentation](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/getting-started?view=li-lms-2026-10) for provider details.

## Hosted option

[getmcpads for LinkedIn Ads](https://www.getmcpads.com/tools/linkedin-ads?utm_source=github&utm_medium=readme&utm_campaign=linkedin-ads) manages the hosted connection and account selection.
Hosted and source releases can differ. Contact: hello@getmcpads.com.

## Development

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run catalog
```

All tests run offline with mocked `fetch` responses. No live account is read or changed.

## Tools

Every tool is listed below. See [server-card.json](server-card.json) for complete parameter and output schemas. Every tool except `linkedin_list_ad_accounts`, `linkedin_health_check` and `linkedin_validate_query` takes a configured `adAccountId`.

<details>
<summary><b>18 read tools</b></summary>

| Tool | Purpose |
| --- | --- |
| `linkedin_health_check` | Check the token, the configured accounts it reaches, the reporting endpoint and the API version, without returning the token |
| `linkedin_list_ad_accounts` | List the configured ad accounts the member can reach, with currency, status and serving status |
| `linkedin_get_account_details` | Read one ad account in full, with the members who hold a role on it |
| `linkedin_get_campaign_groups` | List campaign groups with budget, schedule and serving status |
| `linkedin_get_campaigns` | List campaigns with status, objective, format, bid, budget and schedule, optionally with targeting |
| `linkedin_get_creatives` | List creatives with intended status, review verdict and serving hold reasons |
| `linkedin_get_entity` | Read one campaign group, campaign or creative and verify account ownership |
| `linkedin_get_setup_guide` | Read the account, supported formats and native write requirements before preparing changes |
| `linkedin_get_insights` | Run a report grouped by one pivot, with computed ratios |
| `linkedin_run_statistics_report` | Run a report grouped by up to three pivots at once |
| `linkedin_get_demographics` | Break delivery down by professional demographics, with names resolved and the limits stated |
| `linkedin_get_revenue_attribution` | Read CRM pipeline and closed won revenue attributed to LinkedIn advertising |
| `linkedin_validate_query` | Check a pivot and metric combination against the reporting rules, without a request |
| `linkedin_get_delivery_status` | Explain why ads are or are not serving, from the account down to the creative |
| `linkedin_find_targeting` | Look up native targeting URNs, such as countries or job titles, by name |
| `linkedin_list_media` | List the account image or video library with download URLs and processing status |
| `linkedin_get_media` | Refresh one image or video URL and verify its library association |
| `linkedin_list_ad_creatives` | List the images and videos used by ads, with the actual ad names and landing pages |

</details>

<details>
<summary><b>15 write tools</b></summary>

Disabled by default. Calls preview unless explicitly confirmed. Check the configuration and exact schema before use.

| Tool | Purpose |
| --- | --- |
| `linkedin_create_campaign_group` | Create a DRAFT campaign group |
| `linkedin_create_campaign` | Create a DRAFT text ad or sponsored content campaign with budget, bid, targeting and schedule |
| `linkedin_create_text_ad` | Create a DRAFT text ad with an image from the account library |
| `linkedin_create_media_ad` | Create a DRAFT sponsored image or video ad on a dark post |
| `linkedin_update_entity` | Rename, pause or archive, or edit budget, bid, schedule, targeting or text ad content |
| `linkedin_rename_campaign_group` | Rename a campaign group, and nothing else |
| `linkedin_rename_campaign` | Rename a campaign, and nothing else |
| `linkedin_rename_ad` | Rename an ad (creative), and nothing else |
| `linkedin_rename_ad_account` | Rename the ad account, and nothing else |
| `linkedin_duplicate_ad` | Copy an ad into a verified campaign as DRAFT |
| `linkedin_delete_draft_ad` | Delete one DRAFT ad, without touching its post or media |
| `linkedin_initialize_upload` | Start an image or video upload to the account library and return a signed receipt |
| `linkedin_upload_part` | Upload one part of the file to LinkedIn's signed upload URL |
| `linkedin_finalize_upload` | Finalize a video once every part is uploaded |
| `linkedin_update_media` | Rename or archive a library image or video |

</details>

<details>
<summary><b>6 resources</b></summary>

| Resource | Content |
| --- | --- |
| `linkedin://manifest` | Configured accounts, API version, entity hierarchy and safety rules |
| `linkedin://metrics` | The metric catalog, with formulas of computed ratios and the pivots each metric is unavailable with |
| `linkedin://pivots` | Pivots and the finder that serves each one |
| `linkedin://reporting-rules` | Scoping, row cap, retention, freshness, demographic limits and throttling |
| `linkedin://targeting` | Shape of the targeting criteria, lookup and audience limits |
| `linkedin://recipes` | Tool sequences for common questions |

</details>

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

## More from getmcpads

[Meta Ads](https://github.com/get-mcp-ads/meta-ads-mcp-server) · [Google Ads](https://github.com/get-mcp-ads/google-ads-mcp-server) · [Google Analytics 4](https://github.com/get-mcp-ads/google-analytics-mcp-server) · [Google Search Console](https://github.com/get-mcp-ads/google-search-console-mcp-server) · [TikTok Ads](https://github.com/get-mcp-ads/tiktok-ads-mcp-server) · [Pinterest Ads](https://github.com/get-mcp-ads/pinterest-ads-mcp-server) · [X Ads](https://github.com/get-mcp-ads/x-ads-mcp-server)

Maintained by **Emmanuel** at [getmcpads](https://www.getmcpads.com). Questions: [hello@getmcpads.com](mailto:hello@getmcpads.com).

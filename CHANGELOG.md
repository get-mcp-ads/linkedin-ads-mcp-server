# Changelog

## 1.0.1 - 2026-10-26 - Zod 4 security update
- Update `zod` to 4.6.7. Every Zod release before 4.6.6 is covered by the high-severity advisory GHSA-mrhx-c7xc-m3w5: validating an oversized constrained collection can exhaust memory, and no Zod 3 release carries the fix. `npm audit --omit=dev` reports no vulnerability again.
- Keep the Zod 3 validation behaviour. A parameter default is still validated and completed before use, so an omitted object must still supply its required fields.
- Tool names, parameters and descriptions published over MCP are unchanged. `server-card.json` is regenerated with Zod 4's JSON Schema output, which spells some constraints differently.

## 1.0.0 - 2026-10-23 - First standalone release
- First standalone release, ported from the native LinkedIn Ads tools of the getmcpads gateway at revision `3e1c2c8`.
- 18 read tools: account discovery and health check, account details, campaign groups, campaigns, creatives, single entities, setup requirements, analytics and statistics reports, professional demographics, revenue attribution, offline query validation, delivery status, targeting lookup, the media library and the media used by ads.
- 15 write tools, exposed only with `LINKEDIN_ADS_ENABLE_WRITES=true`: DRAFT campaign groups, campaigns, text ads and sponsored image or video ads, entity edits, four rename tools, ad duplication, draft deletion, signed multipart uploads and media library updates. Every write previews unless `confirm` is true, and none activates delivery.
- 6 resources: manifest, metric catalog, pivots, reporting rules, targeting and recipes.
- Require `LINKEDIN_ADS_ACCOUNT_IDS` and refuse every other account before any request. Verify child filters and parent entities against the account.
- Contact only the LinkedIn API, token and upload endpoints, declared in `src/core/http.ts`, never follow a redirect, bound every response and redact tokens from results and errors. Renew the access token in memory when refresh credentials are set.
- Require Node.js 22.23.4, 24.22.1, 26.12.1 or newer, and warn on stderr at startup on an older release. CI covers Node 22, 24 and 26.
- Publish from a version tag with `release.yml`: npm with provenance, the GitHub release, then the MCP Registry.

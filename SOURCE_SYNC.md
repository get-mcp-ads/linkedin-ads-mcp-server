# Source synchronization

Reviewed on 2026-10-23 against getmcpads source revision `3e1c2c8`. This is the first standalone release for LinkedIn Ads. The most recent gateway change to the LinkedIn source is `958ba80` (2026-10-21).

## Synchronized

- The 30 native tools of the hosted LinkedIn inventory, with the gateway names: 15 reads and 15 writes, including the rename tools of `958ba80` (campaign group, campaign, ad and ad account, each sending the name alone).
- Writes on any configured account, from `42a14a6` (2026-10-13): DRAFT creations, campaign configuration and text-ad edits, media metadata updates, draft duplication and deletion, signed multipart uploads. The account is re-read before each write and every parent or target entity is checked against it. Activation stays out, as in the gateway.
- The reporting engine: metric and pivot catalogs, the query planner with the 20 field ceiling, the pivot compatibility rules and the computed ratios. Code comments are translated to English and "the gateway" reads "this server".
- The fixes of `bdb5dd5` and `7896379`: numeric ad IDs are sent as `urn:li:sponsoredCreative` route keys, and text-ad edits keep the fields that are not changed.
- Six of the seven gateway resources: manifest, metrics, pivots, reporting rules, targeting and recipes.

## Added from the gateway source

Three tools exist in the gateway's LinkedIn source but are not exposed by the hosted product, which has its own account discovery and diagnostics:

- `linkedin_list_ad_accounts`, rewritten to search and return only the accounts in `LINKEDIN_ADS_ACCOUNT_IDS`.
- `linkedin_health_check`, which now reports the configured accounts the token cannot reach.
- `linkedin_validate_query`, unchanged, with no request to LinkedIn.

Reports point at the last two in their own messages, so both are kept.

## Adapted

- Hosted workspace account selection becomes `LINKEDIN_ADS_ACCOUNT_IDS`, checked before every request.
- The hosted `rw_ads` grant check becomes the optional `LINKEDIN_ADS_SCOPES`.
- Hosted token renewal (database lease and a signed delegation to the web app) becomes an in-memory refresh with the app's own refresh token, client ID and secret. Nothing is persisted.
- Upload receipts are signed with a key generated at startup instead of the hosted job signing key. They stop being valid when the process ends.
- Requests use `redirect: "error"` instead of `"manual"`, carry a timeout and read a bounded response. Reads renew the token once on 401.
- A failed write reports `verify_before_retry` only when a mutation was actually sent, and `not_applied` when the failure came before it. The gateway reports `verify_before_retry` for any failure after confirmation.
- Previews add `activationOffered: false` and `mayChangeSpend`, which flags budget, bid, schedule and targeting edits.
- The delivery status scan asks LinkedIn for at most 100 creatives per page, the documented maximum of the creatives finder; the gateway asks for 200. It now reports when the scan is partial.
- `linkedin_list_media` returns computed paging offsets instead of LinkedIn's raw paging links.

## Not synchronized

- Gateway source tools that the hosted product does not expose: `linkedin_get_creative_review_status`, `linkedin_get_targeting_facets`, `linkedin_get_targeting_entities`, `linkedin_get_campaign_targeting`, `linkedin_estimate_audience`, `linkedin_get_bid_guidance`, `linkedin_get_supply_forecast`, `linkedin_get_audiences`, `linkedin_get_conversions`, `linkedin_get_lead_forms`, `linkedin_get_experiments`, `linkedin_get_organization_pages`, `linkedin_resolve_urns` and `linkedin_get_read_endpoint`. The last one passes arbitrary Rest.li parameters to a list of roots that includes resources outside any ad account, which the account allowlist cannot cover.
- The `linkedin://read-endpoints` resource, which documents `linkedin_get_read_endpoint`.
- `568b912` (2026-09-22), the reporting catalog behind hosted Google Sheets exports.
- `LinkedInSandbox` and test account creation, which are operator scripts of the hosted product.

The public server remains self-contained. Hosted billing, quotas and plans, workspaces, stored account selection, token storage and encryption, creative galleries, the Launcher, alerts, Google Sheets exports, client memory, telemetry, partner integrations, MCP Apps UI and the discovery meta-tools (`get_capabilities`, `describe_tool`, `run_tool`) stay hosted-only.

Validation uses synthetic data. No live advertising read or write is required by the test suite. The generated server-card.json is the source of truth for this revision's tool schemas.

Maintainer: Emmanuel, getmcpads. Contact: hello@getmcpads.com.

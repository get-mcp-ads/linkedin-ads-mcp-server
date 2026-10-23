# Security Policy

This server holds a token that can read, and when writes are enabled change,
live LinkedIn advertising accounts. We take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository:
[Report a vulnerability](https://github.com/get-mcp-ads/linkedin-ads-mcp-server/security/advisories/new),
or write to hello@getmcpads.com. Do not include live tokens or customer data.

We aim to acknowledge a report within 3 business days and to ship a fix or a
documented mitigation within 30 days. We will credit you in the advisory unless
you ask us not to.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## What this server does with your token

- The access token, and the refresh credentials when used, are read once from
  the environment at startup and kept in memory. A token renewed through the
  refresh token stays in memory too. None is written to disk, logged or
  returned by a tool, and every result and error is redacted before it
  reaches the model.
- Requests go to three fixed destinations, declared in `src/core/http.ts`:
  the Marketing API at `api.linkedin.com/rest`, the OAuth token endpoint on
  `www.linkedin.com`, and the signed upload URLs under
  `www.linkedin.com/dms-uploads/`. *A test fails the build if another host
  appears in the source.*
- **No request follows a redirect.** The single network function sets
  `redirect: "error"`, so a redirect cannot forward your token to another
  host. Every request has a timeout and a bounded response size. *A test fails
  the build if a fetch omits this.*
- No telemetry, no analytics, no phone-home.

## Account scope

Only the ad accounts listed in `LINKEDIN_ADS_ACCOUNT_IDS` are read or changed.
Any other account is refused before a request is made, and account discovery
filters LinkedIn's answer to the configured list. Campaign, group and creative
filters, parents and targets are verified against the account.

## URLs returned by LinkedIn

Upload URLs and media URLs come from the API. They are data, not values to
trust:

- Upload URLs must be HTTPS on `www.linkedin.com` under `/dms-uploads/`, must
  not point at a loopback, private, link-local or metadata address, carry no
  token, and are never followed through a redirect. They travel inside
  HMAC-signed receipts, so a model cannot substitute another URL. The signing
  key is generated at startup and never leaves the process.
- Media download URLs are returned only when they are plain HTTPS on the
  LinkedIn media CDN. This server never requests them.

## Writes

Write tools exist only when `LINKEDIN_ADS_ENABLE_WRITES` is exactly `true`.
Each previews unless called with `confirm: true`. New campaign groups,
campaigns and ads are DRAFT, and no tool activates delivery. A mutation is
sent once and never retried automatically; a failed write says whether it
reached LinkedIn, so it can be verified before any retry.

## Personal data

No tool returns submitted lead gen data. Account user listings return member
URNs and roles as LinkedIn provides them.

## Handling your token safely

- Grant `r_ads` and `r_ads_reporting` for reads, plus `r_organization_social`
  if you use `linkedin_list_ad_creatives`. Add `rw_ads` and
  `w_organization_social` **only** if you enable writes.
- Treat the token like a password: it is a bearer credential.
- Your MCP client config file is usually plain text on disk. Check its
  permissions, and never commit it.
- Revoke and replace the token if you suspect exposure.

## Scope

Vulnerabilities in the LinkedIn API itself are not in scope here; report those
to LinkedIn.

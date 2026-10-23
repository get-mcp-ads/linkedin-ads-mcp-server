# Contributing

Thanks for considering a contribution. This project is maintained by
[GetMCPAds](https://www.getmcpads.com) and is open to outside patches.

## Getting set up

Use Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release: older ones lack the
October 2026 security fixes.

```bash
git clone https://github.com/get-mcp-ads/linkedin-ads-mcp-server.git
cd linkedin-ads-mcp-server
npm ci
cp .env.example .env
```

Then run the checks:

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

All four must pass. CI runs them on Node 22, 24 and 26. `npm test` runs the
offline suites against the build, so build first.

## Ground rules

**Never commit a token.** `.env` is gitignored. Before opening a PR, re-read
your diff for anything that looks like a LinkedIn access or refresh token.

**Tests use synthetic data.** Every test mocks `fetch`. Do not add a test that
needs live credentials to pass; CI has none.

**Reporting field names are the load-bearing part.** The metric catalog uses
LinkedIn's raw `adAnalytics` field names. If you add or change one, say in the
PR description where it comes from: a link to the LinkedIn documentation, or
the API behaviour you observed. A field LinkedIn does not serve is dropped from
the response rather than refused, so a plausible-looking one fails silently.

**Keep the account scope.** Every tool that reaches an account checks it
against `LINKEDIN_ADS_ACCOUNT_IDS` before any request, and filters must be
verified against the account. Do not add a generic endpoint passthrough.

**Write tools must preview first.** Any new write tool has to accept `confirm`
and return a preview when it is absent. Creations stay DRAFT, and a mutation is
never retried automatically. A tool that changes an account on the first call
will not be merged.

**Keep it self-contained.** Runtime dependencies are `@modelcontextprotocol/sdk`
and `zod`. Adding a third needs a good reason.

**Stay native.** Hosted features such as creative galleries, campaign
launches, alerts, exports and MCP Apps UI do not belong in this repository.

## Credentials never reach the logs or another host

The tests fail if any `fetch` omits `redirect: "error"`, if a request is made
outside `src/core/http.ts`, if a host other than `api.linkedin.com` and
`www.linkedin.com` appears in the source, or if anything writes to stdout,
which carries the MCP protocol.

## Documentation

Keep all documentation in English, in plain declarative sentences, without em
dashes. The README cites every tool and resource and its counts match the
code; a test checks both.

## Commit and PR style

- One logical change per PR.
- Explain *why*, not just *what*. The diff already says what.
- If you fix a bug, add the test that would have caught it.

## Reporting bugs

Open an issue with: what you called, what you expected, what you got, and the
`LinkedIn-Version` in use. Redact IDs and tokens.

For anything security-related, do not open an issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are licensed under the
Apache License 2.0, as stated in [LICENSE](LICENSE).

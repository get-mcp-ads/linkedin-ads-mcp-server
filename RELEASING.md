# Publishing releases

A version tag publishes a release. The `release.yml` workflow does the rest, in the order the MCP Registry requires.

## Before tagging

1. Bump the version in `package.json`, `server.json` (both `version` fields) and `PACKAGE_VERSION` in `src/server.ts`. The test suite fails when they disagree.
2. Add a `## X.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`. The workflow uses it as the GitHub release notes and stops if it is missing.
3. Update the README (What's new, the install tag, upgrade notes, tool counts) and regenerate `server-card.json` with `npm run catalog`.
4. Merge the reviewed change into `main` after CI succeeds.

## Tagging

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

Pushing the tag starts **Release**. It checks out the tag, runs `npm ci`, the runtime dependency audit, the typecheck, the build and the tests, and checks that the tag equals the `package.json` version. Then it:

1. publishes the package to npm with provenance, through npm trusted publishing (no npm token is stored in the repository);
2. creates the GitHub release for the tag from the matching `CHANGELOG.md` section and marks it as Latest;
3. publishes `server.json` to the MCP Registry, authenticated with the `getmcpads.com` DNS key in the `MCP_DNS_PRIVATE_KEY` secret.

The registry reads `mcpName` from the published npm package, which is why npm comes first.

## Rerunning a partial release

Each step skips when its target already holds the version, so rerunning is safe. Run **Release** from the Actions tab with the existing tag, such as `v1.0.0`, to finish a release that stopped part way.

## One-time setup

- npm: the `@getmcpads/linkedin-ads-mcp-server` package needs a trusted publisher on npmjs.com that points at this repository and the workflow file `release.yml`.
- MCP Registry: the repository needs the `MCP_DNS_PRIVATE_KEY` secret for the `getmcpads.com` domain.

The README install commands select a tag from the GitHub source. The npm package and the MCP Registry entry come from the same workflow run, after the tag exists.

Before tagging, add the release to CHANGELOG.md as `## X.Y.Z - YYYY-MM-DD - Title`, then run `npm run release-history`. The README shows every release from the changelog, and the test suite fails when it falls behind.

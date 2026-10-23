/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Account-scoped reads: setup requirements, single entities, targeting lookup,
 * the media library and the media used by ads.
 */
import { z } from "zod";
import { LinkedInMcpError } from "../../core/errors.js";
import { addRead, type Collector, type LinkedInContext } from "./context.js";
import { accountUrn, libraryAsset, libraryPage, type MediaAsset, visual } from "./media.js";
import type { NativeObject } from "./transport.js";

export const mediaIdSchema = z
  .string()
  .regex(/^urn:li:(image|video):[A-Za-z0-9_-]+$/)
  .describe("Exact urn:li:image or urn:li:video associated with the selected account library.");
export const entityKindSchema = z.enum(["adCampaignGroups", "adCampaigns", "creatives"]).describe("Native resource type to read or modify.");
export const entityIdSchema = z
  .string()
  .regex(/^(\d+|urn:li:sponsoredCreative:\d+)$/)
  .describe("Native numeric ID or sponsoredCreative URN; account ownership is verified.");

export function registerLinkedInAccountTools(c: Collector, ctx: LinkedInContext): void {
  addRead(
    c,
    ctx,
    "linkedin_get_setup_guide",
    "Read account, supported formats and native LinkedIn write requirements before preparing changes.",
    {},
    async (a, { api }) => ({
      account: await api.read(`/adAccounts/${a.adAccountId}`),
      apiVersion: api.version,
      writesEnabled: ctx.config.enableWrites,
      writes:
        "Configured accounts only, and only when LINKEDIN_ADS_ENABLE_WRITES is true. Native account roles and organization permissions apply. " +
        "Campaign groups contain campaigns; campaigns hold targeting, budget and bid; creatives are the ads. " +
        "Creations are DRAFT and sponsored posts use feedDistribution NONE. Every write previews first and applies only with confirm: true. " +
        "Activation is not offered: activate in Campaign Manager, where delivery and spend start.",
      formats: ["TEXT_AD", "SPONSORED_UPDATES image", "SPONSORED_UPDATES video"],
      media:
        "Asset metadata can be renamed or archived; changing binary content requires a new upload. Uploaded videos process asynchronously. " +
        "Library files are not proof of delivery.",
      money: "Budgets and bids are decimal strings in the account currency, such as \"20.00\" with currencyCode \"EUR\". They are not micros or cents.",
    }),
    { account: "required" },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_entity",
    "Read one campaign group, campaign or creative and verify account ownership.",
    { kind: entityKindSchema, entityId: entityIdSchema },
    async (a, { api }) => ({ entity: await api.owned(a.adAccountId, a.kind, a.entityId) }),
    { account: "required" },
  );

  addRead(
    c,
    ctx,
    "linkedin_find_targeting",
    "Look up native targeting URNs such as countries by name.",
    {
      query: z.string().min(1).max(100).describe("Search text used by the native targeting lookup."),
      facet: z
        .string()
        .regex(/^urn:li:adTargetingFacet:[A-Za-z]+$/)
        .default("urn:li:adTargetingFacet:locations")
        .describe("Native targeting facet URN; defaults to location targeting."),
    },
    async (a, { client }) => client.targetingEntities({ finder: "typeahead", query: a.query, facet: a.facet }),
    { account: "required" },
  );

  addRead(
    c,
    ctx,
    "linkedin_list_media",
    "List account image/video library files with download URLs and native processing status; not ad performance.",
    {
      kind: z.enum(["images", "videos"]).describe("Library to list: images or videos."),
      start: z.number().int().min(0).max(10_000).default(0).describe("Zero-based offset in the media library page."),
      limit: z.number().int().min(1).max(100).default(30).describe("Maximum results in this page; inspect paging/coverage for additional data."),
    },
    async (a, { api }) => {
      const page = await libraryPage(api, a.adAccountId, a.kind, a.start, a.limit);
      const rows = page.elements ?? [];
      if (rows.some((row: NativeObject) => row.mediaLibraryMetadata?.associatedAccount !== accountUrn(a.adAccountId))) {
        throw new LinkedInMcpError("LinkedIn returned a library file of another ad account.", 502);
      }
      return {
        media: rows,
        assets: rows.map((row: NativeObject) => visual(row)),
        paging: { start: a.start, count: rows.length, nextStart: a.start + rows.length },
        coverage: { partial: rows.length >= a.limit || Boolean(page.paging?.links?.some((link: NativeObject) => link.rel === "next")) },
        note: "Signed download URLs expire; call again to refresh. Binary files cannot be replaced in place.",
      };
    },
    { account: "required" },
  );

  addRead(
    c,
    ctx,
    "linkedin_get_media",
    "Refresh one image/video URL and verify library association.",
    { mediaId: mediaIdSchema },
    async (a, { api }) => ({ media: await libraryAsset(api, a.adAccountId, a.mediaId) }),
    { account: "required" },
  );

  addRead(
    c,
    ctx,
    "linkedin_list_ad_creatives",
    "List the images and playable videos used by the ads of an account, with the actual ad names. Separates " +
      "landing URLs from media URLs. Does not report delivery.",
    {
      limit: z.number().int().min(1).max(50).default(20).describe("Maximum ads scanned in this page; inspect coverage for additional data."),
      pageToken: z.string().max(2000).optional().describe("Opaque nextPageToken from the preceding response; omit for the first page."),
      adIds: z
        .array(z.string().regex(/^(\d+|urn:li:sponsoredCreative:\d+)$/))
        .max(10)
        .optional()
        .describe("Exact ad IDs to resolve instead of listing a page, up to ten."),
    },
    async (a, { api, client }) => {
      const page = a.adIds
        ? {
            elements: await Promise.all((a.adIds as string[]).map((id) => api.owned(a.adAccountId, "creatives", id))),
            metadata: { nextPageToken: null },
          }
        : await client.searchCreatives(a.adAccountId, { pageSize: a.limit, pageToken: a.pageToken });
      const assets: MediaAsset[] = [];
      const warnings: string[] = [];
      for (const ad of (page.elements ?? []) as NativeObject[]) {
        try {
          if (ad.account !== accountUrn(a.adAccountId)) throw new LinkedInMcpError("Ad account mismatch.", 502);
          let media = ad.content?.textAd?.image;
          let landing = ad.content?.textAd?.landingPage;
          const postUrn = ad.content?.reference;
          if (postUrn) {
            // The ad-to-post reference is account scoped; arbitrary post lookups are not offered.
            if (!/^urn:li:(share|ugcPost):\d+$/.test(postUrn)) throw new LinkedInMcpError("Unsupported post reference.", 400);
            const post = await api.read(`/posts/${encodeURIComponent(postUrn)}`);
            media = post.content?.media?.id;
            landing = post.contentLandingPage;
            if (!media) {
              warnings.push(`Ad ${ad.id}: unsupported or text-only post format; no substitute preview.`);
              continue;
            }
          }
          if (!media || !mediaIdSchema.safeParse(media).success) {
            warnings.push(`Ad ${ad.id}: no supported image/video asset.`);
            continue;
          }
          const row = await libraryAsset(api, a.adAccountId, media);
          if (row.status !== "AVAILABLE") warnings.push(`Ad ${ad.id}: media status ${row.status}.`);
          assets.push(visual(row, ad, landing));
        } catch (error) {
          warnings.push(`Ad ${ad.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return {
        assets,
        warnings,
        nextPageToken: page.metadata?.nextPageToken ?? null,
        coverage: {
          partial: Boolean(page.metadata?.nextPageToken) || warnings.length > 0,
          scannedAds: page.elements?.length ?? 0,
          returnedAssets: assets.length,
        },
        note: "Ad inventory only. Test accounts cannot deliver.",
      };
    },
    { account: "required" },
  );
}

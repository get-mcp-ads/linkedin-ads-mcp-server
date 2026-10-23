/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Write tools. Registered only when LINKEDIN_ADS_ENABLE_WRITES is true. Each
 * previews unless confirm is true, creates DRAFT entities, and offers no
 * activation.
 */
import { z } from "zod";
import { LinkedInMcpError } from "../../core/errors.js";
import { LINKEDIN_UPLOAD_ORIGIN, LINKEDIN_UPLOAD_PATH_PREFIX, sendRequest } from "../../core/http.js";
import { entityIdSchema, entityKindSchema, mediaIdSchema } from "./account-tools.js";
import { addWrite, type Collector, type LinkedInContext } from "./context.js";
import { accountUrn, forgetLibrary, libraryAsset } from "./media.js";
import { signReceipt, verifyReceipt } from "./receipts.js";
import type { NativeObject } from "./transport.js";

const MiB = 1024 * 1024;
const numericId = z.string().regex(/^\d+$/);
const name = z.string().min(1).max(200).describe("Name stored in LinkedIn; does not rename source files or organic posts.");
const creativeId = z.string().regex(/^(\d+|urn:li:sponsoredCreative:\d+)$/);
const imageId = z
  .string()
  .regex(/^urn:li:image:[A-Za-z0-9_-]+$/)
  .describe("Exact image URN already uploaded into the selected account library.");
const landingPage = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "HTTPS URL required")
  .describe("HTTPS click destination; separate from the image/video download URL.");
const urnValue = z.string().regex(/^urn:li:[A-Za-z]+:[A-Za-z0-9_-]+$/);
const targeting = z
  .object({
    include: z
      .object({
        and: z.array(z.object({ or: z.record(z.array(urnValue).min(1).max(200)) }).strict()).min(1).max(15),
      })
      .strict(),
    exclude: z.object({ or: z.record(z.array(urnValue).min(1).max(200)) }).strict().optional(),
  })
  .strict()
  .describe(
    "Native LinkedIn targeting criteria with facet keys and entity URNs, such as " +
      '{ include: { and: [ { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:105015875"] } } ] } }. Use linkedin_find_targeting first.',
  );
const schedule = z
  .object({
    start: z.number().int().positive().describe("Start, UTC epoch milliseconds."),
    end: z.number().int().positive().optional().describe("Optional end, UTC epoch milliseconds, later than start."),
  })
  .strict()
  .refine((value) => !value.end || value.end > value.start, "End must be after start")
  .describe("UTC epoch timestamps in milliseconds; optional end must be later than start.");
const money = z
  .object({
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .refine((value) => Number(value) > 0)
      .describe('Decimal amount in currency units, such as "20.00". Not micros or cents.'),
    currencyCode: z.string().regex(/^[A-Z]{3}$/).describe("ISO currency code. It must equal the ad account currency."),
  })
  .strict();

export function registerLinkedInWrites(c: Collector, ctx: LinkedInContext): void {
  addWrite(
    c,
    ctx,
    "linkedin_create_campaign_group",
    "Create a DRAFT campaign group in a configured account. Preview by default.",
    { name, runSchedule: schedule },
    async (a, { api }) => ({
      result: await api.create(a.adAccountId, "adCampaignGroups", {
        account: accountUrn(a.adAccountId),
        name: a.name,
        status: "DRAFT",
        runSchedule: a.runSchedule,
      }),
    }),
  );

  addWrite(
    c,
    ctx,
    "linkedin_create_campaign",
    "Create an inactive (DRAFT) text or sponsored-content campaign. LinkedIn campaigns hold budget, targeting and " +
      "bid. Audience expansion and the LinkedIn Audience Network stay off. Native compatibility still applies.",
    {
      name,
      campaignGroupId: numericId.describe("Numeric parent campaign-group ID in the selected account."),
      type: z.enum(["TEXT_AD", "SPONSORED_UPDATES"]).describe("TEXT_AD for text ads, SPONSORED_UPDATES for sponsored image or video posts."),
      objectiveType: z
        .enum(["WEBSITE_VISIT", "ENGAGEMENT", "VIDEO_VIEW", "BRAND_AWARENESS", "WEBSITE_CONVERSION", "LEAD_GENERATION"])
        .describe("Native objective; must be compatible with the campaign type and ad format."),
      dailyBudget: money.describe('Daily budget in currency units, not minor units: amount "20.00" with currencyCode "EUR".'),
      unitCost: money.describe("Maximum bid in account currency units, not cents."),
      costType: z.enum(["CPC", "CPM"]).describe("Native bidding basis: CPC per click or CPM per thousand impressions."),
      locale: z
        .object({
          country: z.string().length(2).describe("Two-letter country code, such as US."),
          language: z.string().length(2).describe("Two-letter language code, such as en."),
        })
        .strict()
        .describe("Two-letter campaign language and country codes."),
      targetingCriteria: targeting,
      runSchedule: schedule,
      politicalIntent: z.enum(["NOT_POLITICAL", "POLITICAL"]).describe("Explicit advertiser declaration; do not infer."),
    },
    async (a, { api }) => {
      const account = await api.requireWriteAccount(a.adAccountId);
      if (a.dailyBudget.currencyCode !== account.currency || a.unitCost.currencyCode !== account.currency) {
        throw new LinkedInMcpError(`Budget and bid must use the account currency, ${account.currency}.`, 400);
      }
      return {
        result: await api.create(a.adAccountId, "adCampaigns", {
          account: accountUrn(a.adAccountId),
          campaignGroup: `urn:li:sponsoredCampaignGroup:${a.campaignGroupId}`,
          name: a.name,
          type: a.type,
          objectiveType: a.objectiveType,
          status: "DRAFT",
          dailyBudget: a.dailyBudget,
          unitCost: a.unitCost,
          costType: a.costType,
          locale: a.locale,
          targetingCriteria: a.targetingCriteria,
          runSchedule: a.runSchedule,
          politicalIntent: a.politicalIntent,
          offsiteDeliveryEnabled: false,
          audienceExpansionEnabled: false,
        }),
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_create_text_ad",
    "Create a DRAFT text ad with an existing account-library image. Preview by default.",
    {
      name,
      campaignId: numericId.describe("Numeric parent campaign ID in the selected account."),
      image: imageId,
      headline: z.string().min(1).max(25).describe("Text ad headline, up to 25 characters."),
      description: z.string().min(1).max(75).describe("Text ad body, up to 75 characters."),
      landingPage,
    },
    async (a, { api }) => {
      await libraryAsset(api, a.adAccountId, a.image);
      return {
        result: await api.create(a.adAccountId, "creatives", {
          account: accountUrn(a.adAccountId),
          campaign: `urn:li:sponsoredCampaign:${a.campaignId}`,
          name: a.name,
          intendedStatus: "DRAFT",
          content: { textAd: { headline: a.headline, description: a.description, landingPage: a.landingPage, image: a.image } },
        }),
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_create_media_ad",
    "Create a DRAFT sponsored image/video ad, with a dark post (feedDistribution NONE). Does not publish an organic feed post.",
    {
      name,
      campaignId: numericId.describe("Numeric parent campaign ID in the selected account."),
      mediaId: mediaIdSchema,
      commentary: z.string().min(1).max(3000).describe("Sponsored post copy. The created post is excluded from organic feed distribution."),
      landingPage,
    },
    async (a, { api }) => {
      const row = await libraryAsset(api, a.adAccountId, a.mediaId);
      const account = await api.requireWriteAccount(a.adAccountId);
      if (row.owner !== account.reference || row.status !== "AVAILABLE") {
        throw new LinkedInMcpError("Media must be AVAILABLE and owned by the organization of the ad account.", 409);
      }
      return {
        result: await api.createInline(a.adAccountId, a.campaignId, a.name, a.mediaId, {
          commentary: a.commentary,
          landingPage: a.landingPage,
        }),
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_update_entity",
    "Rename, pause/archive or edit budget, schedule, targeting or text-ad content of an owned campaign/group/ad in " +
      "the selected account. No activation offered. Nested settings replace the corresponding object.",
    {
      kind: entityKindSchema,
      entityId: entityIdSchema,
      fields: z
        .object({
          name: name.optional(),
          status: z.enum(["PAUSED", "ARCHIVED"]).optional().describe("Campaign group or campaign status. ACTIVE is not offered."),
          intendedStatus: z.enum(["DRAFT", "PAUSED", "ARCHIVED"]).optional().describe("Ad (creative) status. ACTIVE is not offered."),
          dailyBudget: money.optional().describe("Daily budget in account currency units."),
          unitCost: money.optional().describe("Maximum bid in account currency units."),
          runSchedule: schedule.optional(),
          targetingCriteria: targeting.optional(),
          textAd: z
            .object({
              headline: z.string().min(1).max(25).optional().describe("Text ad headline, up to 25 characters."),
              description: z.string().min(1).max(75).optional().describe("Text ad body, up to 75 characters."),
              landingPage: landingPage.optional(),
              image: imageId.optional(),
            })
            .strict()
            .refine((value) => Object.keys(value).length > 0)
            .optional()
            .describe("Partial text-ad content edit. Other existing text fields are preserved. Not applicable to sponsored posts."),
        })
        .strict()
        .refine((value) => Object.keys(value).length > 0)
        .describe("Only these supplied fields are changed. Nested values replace the corresponding native object."),
    },
    async (a, { api }) => {
      const account = await api.requireWriteAccount(a.adAccountId);
      for (const amount of [a.fields.dailyBudget, a.fields.unitCost]) {
        if (amount && amount.currencyCode !== account.currency) {
          throw new LinkedInMcpError(`Budget and bid must use the account currency, ${account.currency}.`, 400);
        }
      }
      if (a.kind === "creatives" && Object.keys(a.fields).some((key) => !["name", "intendedStatus", "textAd"].includes(key))) {
        throw new LinkedInMcpError("Ad updates support name, intendedStatus and textAd only.", 400);
      }
      if (a.kind !== "creatives" && a.fields.intendedStatus) throw new LinkedInMcpError("Use status for campaign groups and campaigns.", 400);
      const fields: Record<string, unknown> = { ...a.fields };
      if (a.fields.textAd) {
        if (a.kind !== "creatives") throw new LinkedInMcpError("textAd edits require a creative.", 400);
        const current = await api.owned(a.adAccountId, "creatives", a.entityId);
        if (!current.content?.textAd) {
          throw new LinkedInMcpError("This creative is not a text ad; create a new media ad to replace sponsored content.", 400);
        }
        if (a.fields.textAd.image) {
          const image = await libraryAsset(api, a.adAccountId, a.fields.textAd.image);
          if (image.status !== "AVAILABLE") throw new LinkedInMcpError("The replacement image is not AVAILABLE.", 409);
        }
        fields.content = { textAd: { ...current.content.textAd, ...a.fields.textAd } };
        delete fields.textAd;
      }
      return {
        result: await api.update(a.adAccountId, a.kind, a.entityId, fields),
        entity: await api.owned(a.adAccountId, a.kind, a.entityId),
      };
    },
  );

  // Renames send the name alone, so a group's status or a creative's content
  // cannot move with it. LinkedIn's own words: campaign group, campaign, creative.
  const renames = [
    ["campaign_group", "campaignGroupId", "adCampaignGroups", "campaign group", numericId.describe("Numeric parent campaign-group ID in the selected account.")],
    ["campaign", "campaignId", "adCampaigns", "campaign", numericId.describe("Numeric parent campaign ID in the selected account.")],
    ["ad", "adId", "creatives", "ad (creative)", creativeId.describe("Creative ID or urn:li:sponsoredCreative URN.")],
  ] as const;
  for (const [level, param, kind, label, schema] of renames) {
    addWrite(
      c,
      ctx,
      `linkedin_rename_${level}`,
      `Rename an owned LinkedIn ${label} in the selected account. The name is the only thing that changes.`,
      { [param]: schema, name },
      async (a, { api }) => ({
        result: await api.update(a.adAccountId, kind, a[param], { name: a.name }),
        entity: await api.owned(a.adAccountId, kind, a[param]),
      }),
    );
  }

  addWrite(
    c,
    ctx,
    "linkedin_rename_ad_account",
    "Rename the selected LinkedIn ad account. The name is the only thing that changes.",
    { name },
    async (a, { api }) => ({
      result: await api.renameAccount(a.adAccountId, a.name),
      account: await api.requireWriteAccount(a.adAccountId),
    }),
  );

  addWrite(
    c,
    ctx,
    "linkedin_duplicate_ad",
    "Duplicate a selected account ad into a verified campaign as DRAFT, reusing its exact content reference. Does " +
      "not duplicate campaign settings or activate delivery.",
    {
      sourceCreativeId: creativeId.describe("Existing ad to copy, verified within the selected account."),
      campaignId: numericId.describe("Numeric parent campaign ID in the selected account."),
      name,
    },
    async (a, { api }) => {
      const source = await api.owned(a.adAccountId, "creatives", a.sourceCreativeId);
      return {
        result: await api.create(a.adAccountId, "creatives", {
          account: accountUrn(a.adAccountId),
          campaign: `urn:li:sponsoredCampaign:${a.campaignId}`,
          name: a.name,
          intendedStatus: "DRAFT",
          content: source.content,
        }),
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_delete_draft_ad",
    "Delete one owned DRAFT creative in the selected account. Does not delete its source post or media.",
    { creativeId: creativeId.describe("Numeric ad ID or urn:li:sponsoredCreative ID in the selected account.") },
    async (a, { api }) => ({ result: await api.deleteDraftCreative(a.adAccountId, a.creativeId) }),
  );

  addWrite(
    c,
    ctx,
    "linkedin_initialize_upload",
    "Initialize image/video upload to the selected account library. Returns a signed receipt for part upload and " +
      "finalization. No arbitrary upload host accepted.",
    {
      kind: z.enum(["image", "video"]).describe("Media type to upload: image or video."),
      name,
      fileSizeBytes: z
        .number()
        .int()
        .positive()
        .max(200 * MiB)
        .describe("Exact binary file size in bytes; images up to 8 MiB, videos up to 200 MiB."),
    },
    async (a, { api }) => {
      if (a.kind === "image" && a.fileSizeBytes > 8 * MiB) throw new LinkedInMcpError("Image limit is 8 MiB.", 400);
      const response = a.kind === "image"
        ? await api.initializeImage(a.adAccountId, a.name)
        : await api.initializeVideo(a.adAccountId, a.fileSizeBytes, a.name);
      const value = response.value;
      if (!value) throw new LinkedInMcpError("LinkedIn returned no upload initialization result.", 502);
      const payload = {
        accountId: a.adAccountId,
        kind: a.kind,
        mediaId: value.image ?? value.video,
        size: a.fileSizeBytes,
        value,
        expires: Math.min(Date.now() + 3_600_000, value.uploadUrlsExpireAt ?? value.uploadUrlExpiresAt ?? Infinity),
      };
      return {
        mediaId: payload.mediaId,
        receipt: signReceipt(ctx.receiptKey, payload),
        parts:
          a.kind === "image"
            ? [{ index: 0, firstByte: 0, lastByte: a.fileSizeBytes - 1 }]
            : (value.uploadInstructions ?? []).map((part: NativeObject, index: number) => ({ index, firstByte: part.firstByte, lastByte: part.lastByte })),
        next: "linkedin_upload_part",
        receiptValidity: "This receipt is valid for one hour at most, and only until this server restarts.",
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_upload_part",
    "Upload one base64 file part using the signed initialization receipt. Up to 8 MiB decoded; file bytes stay at " +
      "LinkedIn. No token sent to upload host.",
    {
      receipt: z.string().max(60_000).describe("Signed initialization receipt returned by linkedin_initialize_upload; preserve it exactly."),
      partIndex: z.number().int().min(0).describe("Zero-based part index returned during upload initialization."),
      bytesBase64: z.string().max(12 * MiB).describe("Base64 encoding of the exact required part bytes, up to 8 MiB decoded."),
    },
    async (a, { transport }) => {
      const receipt = verifyReceipt(ctx.receiptKey, a.receipt, a.adAccountId);
      const value = receipt.value;
      const part = receipt.kind === "image"
        ? { uploadUrl: value.uploadUrl, firstByte: 0, lastByte: receipt.size - 1 }
        : value.uploadInstructions?.[a.partIndex];
      if (!part || (receipt.kind === "image" && a.partIndex !== 0)) throw new LinkedInMcpError("Invalid part index.", 400);
      const url = new URL(String(part.uploadUrl));
      if (url.origin !== LINKEDIN_UPLOAD_ORIGIN || !url.pathname.startsWith(LINKEDIN_UPLOAD_PATH_PREFIX)) {
        throw new LinkedInMcpError("Untrusted upload URL.", 502);
      }
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(a.bytesBase64) || a.bytesBase64.length % 4 !== 0) throw new LinkedInMcpError("Invalid base64.", 400);
      const bytes = Uint8Array.from(Buffer.from(a.bytesBase64, "base64"));
      if (bytes.length !== part.lastByte - part.firstByte + 1 || bytes.length > 8 * MiB) {
        throw new LinkedInMcpError("Part length does not match the byte range of this part.", 400);
      }
      // The signed upload URL carries its own authorization: no LinkedIn token is attached.
      transport.mutationsSent += 1;
      const response = await sendRequest(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
        timeoutMs: 60_000,
        maxBytes: 64 * 1024,
      });
      if (response.status < 200 || response.status >= 300) throw new LinkedInMcpError(`LinkedIn refused the upload part with HTTP ${response.status}.`, response.status);
      const etag = response.headers.get("etag");
      if (receipt.kind === "video" && !etag) throw new LinkedInMcpError("LinkedIn returned no part ID (ETag) for the uploaded video part.", 502);
      return {
        mediaId: receipt.mediaId,
        partIndex: a.partIndex,
        partReceipt: signReceipt(ctx.receiptKey, {
          accountId: a.adAccountId,
          mediaId: receipt.mediaId,
          index: a.partIndex,
          etag,
          expires: receipt.expires,
        }),
        next: receipt.kind === "video" ? "linkedin_finalize_upload" : "linkedin_get_media",
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_finalize_upload",
    "Finalize a video after all signed parts were uploaded. Check processing with linkedin_get_media until " +
      "AVAILABLE; never substitute the cover for video.",
    {
      receipt: z.string().max(60_000).describe("Signed initialization receipt returned by linkedin_initialize_upload; preserve it exactly."),
      partReceipts: z
        .array(z.string().max(3000))
        .min(1)
        .max(100)
        .describe("Signed receipts returned by linkedin_upload_part, one for every video part."),
    },
    async (a, { api }) => {
      const receipt = verifyReceipt(ctx.receiptKey, a.receipt, a.adAccountId);
      if (receipt.kind !== "video") throw new LinkedInMcpError("Only videos require finalization.", 400);
      const parts = (a.partReceipts as string[]).map((part) => verifyReceipt(ctx.receiptKey, part, a.adAccountId));
      parts.sort((x, y) => x.index - y.index);
      const expected = receipt.value.uploadInstructions?.length ?? 0;
      if (parts.length !== expected || parts.some((part, index) => part.index !== index || part.mediaId !== receipt.mediaId || !part.etag)) {
        throw new LinkedInMcpError("Missing or mismatched upload parts.", 400);
      }
      return {
        mediaId: receipt.mediaId,
        result: await api.finalizeVideo(a.adAccountId, receipt.mediaId, receipt.value.uploadToken, parts.map((part) => part.etag)),
      };
    },
  );

  addWrite(
    c,
    ctx,
    "linkedin_update_media",
    "Rename or archive an owned account-library image/video. Binary content is immutable; upload a new asset to replace it.",
    {
      mediaId: mediaIdSchema,
      name: name.optional(),
      mediaLibraryStatus: z
        .enum(["ACTIVE", "ARCHIVED"])
        .optional()
        .describe("Archive or restore the library listing; does not replace binary content or alter ad status."),
    },
    async (a, { api }) => {
      if (!a.name && !a.mediaLibraryStatus) throw new LinkedInMcpError("Provide name or mediaLibraryStatus.", 400);
      await libraryAsset(api, a.adAccountId, a.mediaId);
      const result = await api.updateMedia(a.adAccountId, a.mediaId, {
        ...(a.name ? { assetName: a.name } : {}),
        ...(a.mediaLibraryStatus ? { mediaLibraryStatus: a.mediaLibraryStatus } : {}),
      });
      forgetLibrary(api);
      return { result, media: await libraryAsset(api, a.adAccountId, a.mediaId) };
    },
  );
}

/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { LinkedInMcpError } from "../../core/errors.js";
import type { LinkedInResult, LinkedInTransport, NativeObject } from "./transport.js";

export type { LinkedInResult, NativeObject } from "./transport.js";
export type EntityKind = "adCampaignGroups" | "adCampaigns" | "creatives";

/**
 * Account-scoped native API used by the account tools and every write.
 *
 * The configured allowlist is checked before a tool reaches this class. Each
 * mutation then re-reads its ad account and verifies that every parent or
 * target entity belongs to it. LinkedIn roles remain authoritative: this class
 * only narrows what the token could otherwise do.
 */
export class LinkedInAdsApi {
  constructor(private readonly transport: LinkedInTransport) {}

  get version(): string {
    return this.transport.version;
  }

  async read(path: string): Promise<NativeObject> {
    return (await this.transport.call("GET", path)).data;
  }

  async createInline(
    accountId: string,
    campaignId: string,
    name: string,
    media: string,
    content: { commentary: string; landingPage: string },
  ): Promise<LinkedInResult> {
    const account = await this.requireWriteAccount(accountId);
    await this.owned(accountId, "adCampaigns", campaignId);
    if (!/^urn:li:(image|video):[A-Za-z0-9_-]+$/.test(media)) throw new LinkedInMcpError("Invalid media URN.", 400);
    return this.transport.call("POST", `/adAccounts/${accountId}/creatives?action=createInline`, {
      creative: {
        name,
        campaign: `urn:li:sponsoredCampaign:${campaignId}`,
        intendedStatus: "DRAFT",
        inlineContent: {
          post: {
            author: account.reference,
            commentary: content.commentary,
            visibility: "PUBLIC",
            lifecycleState: "PUBLISHED",
            adContext: { dscAdAccount: `urn:li:sponsoredAccount:${accountId}`, dscStatus: "ACTIVE" },
            // A dark post: sponsored delivery only, never the organic feed.
            distribution: { feedDistribution: "NONE", targetEntities: [], thirdPartyDistributionChannels: [] },
            contentCallToActionLabel: "LEARN_MORE",
            contentLandingPage: content.landingPage,
            content: { media: { title: name, id: media } },
          },
        },
      },
    });
  }

  async initializeImage(accountId: string, assetName: string): Promise<NativeObject> {
    const account = await this.requireWriteAccount(accountId);
    return (
      await this.transport.call("POST", "/images?action=initializeUpload", {
        initializeUploadRequest: {
          // Sponsored posts need the image owned by the account's organization.
          owner: account.reference,
          mediaLibraryMetadata: { associatedAccount: `urn:li:sponsoredAccount:${accountId}`, assetName },
        },
      })
    ).data;
  }

  async initializeVideo(accountId: string, size: number, assetName: string): Promise<NativeObject> {
    const account = await this.requireWriteAccount(accountId);
    if (!Number.isSafeInteger(size) || size <= 0 || size > 200 * 1024 * 1024) {
      throw new LinkedInMcpError("Video size must be between 1 byte and 200 MiB.", 400);
    }
    return (
      await this.transport.call("POST", "/videos?action=initializeUpload", {
        initializeUploadRequest: {
          owner: account.reference,
          fileSizeBytes: size,
          uploadCaptions: false,
          uploadThumbnail: false,
          mediaLibraryMetadata: { associatedAccount: `urn:li:sponsoredAccount:${accountId}`, assetName },
        },
      })
    ).data;
  }

  async finalizeVideo(accountId: string, video: string, uploadToken: string, uploadedPartIds: string[]): Promise<LinkedInResult> {
    const account = await this.requireWriteAccount(accountId);
    if (!/^urn:li:video:[A-Za-z0-9_-]+$/.test(video)) throw new LinkedInMcpError("Invalid video URN.", 400);
    const asset = await this.read(`/videos/${encodeURIComponent(video)}`);
    if (asset.owner !== account.reference) {
      throw new LinkedInMcpError("The video belongs to another organization than the ad account.", 403);
    }
    return this.transport.call("POST", "/videos?action=finalizeUpload", {
      finalizeUploadRequest: { video, uploadToken, uploadedPartIds },
    });
  }

  async updateMedia(accountId: string, media: string, fields: NativeObject): Promise<LinkedInResult> {
    await this.requireWriteAccount(accountId);
    if (!/^urn:li:(image|video):[A-Za-z0-9_-]+$/.test(media)) throw new LinkedInMcpError("Invalid media URN.", 400);
    if (Object.keys(fields).some((k) => !["assetName", "mediaLibraryStatus"].includes(k))) {
      throw new LinkedInMcpError("Only the asset name and the library status of a media file can change.", 400);
    }
    const root = media.startsWith("urn:li:image:") ? "images" : "videos";
    return this.transport.call(
      "POST",
      `/${root}/${encodeURIComponent(media)}?associatedAccount=${encodeURIComponent(`urn:li:sponsoredAccount:${accountId}`)}`,
      { patch: { mediaLibraryMetadata: { $set: fields } } },
      { "X-RestLi-Method": "PARTIAL_UPDATE" },
    );
  }

  /** Reads the ad account and refuses one LinkedIn no longer lets change. */
  async requireWriteAccount(id: string): Promise<NativeObject> {
    numericId(id);
    const account = await this.read(`/adAccounts/${id}`);
    if (String(account.id) !== id) throw new LinkedInMcpError("LinkedIn returned a different ad account than requested.", 502);
    if (["CANCELED", "PENDING_DELETION", "REMOVED"].includes(account.status)) {
      throw new LinkedInMcpError(`Ad account ${id} is ${account.status} and cannot be changed.`, 409);
    }
    return account;
  }

  async create(accountId: string, kind: EntityKind, body: NativeObject): Promise<LinkedInResult> {
    await this.requireWriteAccount(accountId);
    const account = `urn:li:sponsoredAccount:${accountId}`;
    if (body.account !== account) throw new LinkedInMcpError("The entity names another ad account.", 400);
    if (kind === "adCampaignGroups" && body.status !== "DRAFT") throw new LinkedInMcpError("Campaign groups are created as DRAFT.", 400);
    if (kind === "adCampaigns") {
      if (!["DRAFT", "PAUSED"].includes(body.status)) throw new LinkedInMcpError("Campaigns are created inactive.", 400);
      await this.owned(accountId, "adCampaignGroups", urnTail(body.campaignGroup, "sponsoredCampaignGroup"));
    }
    if (kind === "creatives") {
      if (!["DRAFT", "PAUSED"].includes(body.intendedStatus)) throw new LinkedInMcpError("Ads are created inactive.", 400);
      await this.owned(accountId, "adCampaigns", urnTail(body.campaign, "sponsoredCampaign"));
    }
    const payload = { ...body };
    if (kind === "creatives") delete payload.account;
    return this.transport.call("POST", `/adAccounts/${accountId}/${kind}`, payload);
  }

  async update(accountId: string, kind: EntityKind, id: string, fields: NativeObject): Promise<LinkedInResult> {
    await this.requireWriteAccount(accountId);
    await this.owned(accountId, kind, id);
    const allowed = ["name", "status", "intendedStatus", "dailyBudget", "totalBudget", "unitCost", "runSchedule", "targetingCriteria", "content"];
    if (Object.keys(fields).some((k) => !allowed.includes(k))) {
      throw new LinkedInMcpError("This field cannot be changed by this server.", 400);
    }
    return this.transport.call(
      "POST",
      `/adAccounts/${accountId}/${kind}/${encodeURIComponent(nativeEntityId(kind, id))}`,
      { patch: { $set: fields } },
      { "X-RestLi-Method": "PARTIAL_UPDATE" },
    );
  }

  async renameAccount(accountId: string, name: string): Promise<LinkedInResult> {
    await this.requireWriteAccount(accountId);
    return this.transport.call("POST", `/adAccounts/${accountId}`, { patch: { $set: { name } } }, { "X-RestLi-Method": "PARTIAL_UPDATE" });
  }

  async deleteDraftCreative(accountId: string, id: string): Promise<LinkedInResult> {
    await this.requireWriteAccount(accountId);
    const creative = await this.owned(accountId, "creatives", id);
    if (creative.intendedStatus !== "DRAFT") throw new LinkedInMcpError("Only a DRAFT ad can be deleted.", 409);
    return this.transport.call(
      "DELETE",
      `/adAccounts/${accountId}/creatives/${encodeURIComponent(nativeEntityId("creatives", id))}`,
      undefined,
      { "X-RestLi-Method": "DELETE" },
    );
  }

  /** Reads one campaign group, campaign or creative and checks it belongs to the account. */
  async owned(accountId: string, kind: string, id: string): Promise<NativeObject> {
    if (!/^\d+$/.test(id) && !/^urn:li:sponsoredCreative:\d+$/.test(id)) throw new LinkedInMcpError("Invalid entity ID.", 400);
    const object = await this.read(`/adAccounts/${accountId}/${kind}/${encodeURIComponent(nativeEntityId(kind, id))}`);
    if (object.account !== `urn:li:sponsoredAccount:${accountId}`) {
      throw new LinkedInMcpError("This LinkedIn entity belongs to another ad account.", 403);
    }
    return object;
  }
}

function numericId(id: string): void {
  if (!/^\d+$/.test(id)) throw new LinkedInMcpError("Ad account IDs are numeric.", 400);
}

/** Creative routes are keyed by URN: a bare numeric ad ID becomes urn:li:sponsoredCreative:ID. */
export function nativeEntityId(kind: string, id: string): string {
  return kind === "creatives" && /^\d+$/.test(id) ? `urn:li:sponsoredCreative:${id}` : id;
}

function urnTail(value: unknown, kind: string): string {
  if (typeof value !== "string" || !new RegExp(`^urn:li:${kind}:\\d+$`).test(value)) {
    throw new LinkedInMcpError("Invalid parent URN.", 400);
  }
  return value.split(":").pop()!;
}

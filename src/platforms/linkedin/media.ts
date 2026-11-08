/**
 * linkedin-ads-mcp-server: an open-source MCP server for the LinkedIn Marketing API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { LinkedInMcpError } from "../../core/errors.js";
import { LINKEDIN_MEDIA_HOST_SUFFIX } from "../../core/http.js";
import type { LinkedInAdsApi } from "./native.js";
import type { NativeObject } from "./transport.js";

export const accountUrn = (accountId: string) => `urn:li:sponsoredAccount:${accountId}`;

/** One image or video of an ad account library, as returned by the media tools. */
export type MediaAsset = {
  id: string;
  nativeAssetId: string;
  platform: "linkedin_ads";
  kind: "image" | "video";
  name: string;
  /** Library labels are distinct from the names of the ads that use a file. */
  nameSource: "ad" | "asset";
  assetName?: string;
  relatedAds?: { id: string; name: string | null }[];
  /** Image to display. For a video, its cover. */
  thumbnail: string | null;
  /** Media URL only, never the ad's click destination. */
  link: string | null;
  assetUrl: string | null;
  /** Separate advertising destination. */
  landingPageUrl?: string;
  video?: string;
  videoId?: string;
};

/** Lists one page of the account's image or video library. Native paging links are never followed. */
export async function libraryPage(api: LinkedInAdsApi, accountId: string, kind: "images" | "videos", start = 0, count = 100) {
  return api.read(
    `/${kind}?q=associatedAccount&associatedAccount=${encodeURIComponent(accountUrn(accountId))}&start=${start}&count=${count}`,
  );
}

type LibraryState = { rows: Map<string, NativeObject>; start: number; done: boolean };
const libraries = new WeakMap<LinkedInAdsApi, Map<string, LibraryState>>();

/** Forgets the library pages read during this call, so the next lookup reads fresh data. */
export function forgetLibrary(api: LinkedInAdsApi): void {
  libraries.delete(api);
}

/**
 * Finds a media file in the account library, reading up to 1,000 entries.
 *
 * A file outside the library of the selected account is refused, even when
 * the token could read it, because ads may only use the account's own media.
 */
export async function libraryAsset(api: LinkedInAdsApi, accountId: string, urn: string): Promise<NativeObject> {
  const kind = urn.startsWith("urn:li:image:") ? "images" : "videos";
  let cache = libraries.get(api);
  if (!cache) {
    cache = new Map();
    libraries.set(api, cache);
  }
  const key = `${accountId}:${kind}`;
  let state = cache.get(key);
  if (!state) {
    state = { rows: new Map(), start: 0, done: false };
    cache.set(key, state);
  }
  while (!state.rows.has(urn) && !state.done && state.start < 1000) {
    const page = await libraryPage(api, accountId, kind, state.start, 100);
    const rows = page.elements ?? [];
    for (const row of rows) {
      if (row.mediaLibraryMetadata?.associatedAccount !== accountUrn(accountId)) {
        throw new LinkedInMcpError("LinkedIn returned a library file of another ad account.", 502);
      }
      state.rows.set(row.id, row);
    }
    state.start += 100;
    state.done = rows.length < 100 && !page.paging?.links?.some((link: NativeObject) => link.rel === "next");
  }
  const row = state.rows.get(urn);
  if (!row) throw new LinkedInMcpError("Media was not found in the selected account library (up to 1,000 entries inspected).", 404);
  return row;
}

/** Keeps a LinkedIn media URL only when it is plain HTTPS on the LinkedIn media CDN. It is returned, never requested. */
export function mediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && url.hostname.endsWith(LINKEDIN_MEDIA_HOST_SUFFIX)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function visual(row: NativeObject, ad?: NativeObject, landing?: string): MediaAsset {
  const kind = String(row.id).startsWith("urn:li:video:") ? "video" : "image";
  const url = mediaUrl(row.downloadUrl);
  return {
    id: ad ? `${ad.id}:${row.id}` : row.id,
    nativeAssetId: row.id,
    platform: "linkedin_ads",
    kind,
    name: ad?.name || (ad ? `Ad ${ad.id}` : row.mediaLibraryMetadata?.assetName || row.id),
    nameSource: ad ? "ad" : "asset",
    assetName: row.mediaLibraryMetadata?.assetName,
    relatedAds: ad ? [{ id: ad.id, name: ad.name ?? null }] : undefined,
    thumbnail: kind === "image" ? url : mediaUrl(row.thumbnail),
    assetUrl: url,
    link: url,
    ...(kind === "video" && url ? { video: url, videoId: row.id } : {}),
    ...(landing ? { landingPageUrl: landing } : {}),
  };
}

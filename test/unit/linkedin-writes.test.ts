import { afterEach, describe, expect, it, vi } from "vitest";
import { collect, json, requestOf, TOKEN } from "./catalogue.js";

afterEach(() => vi.unstubAllGlobals());

const account = (extra: Record<string, unknown> = {}) => json({ id: 1, test: false, currency: "EUR", reference: "urn:li:organization:456", ...extra });
const isMutation = (call: unknown[]) => requestOf(call).init.method !== "GET";

describe("write exposure", () => {
  it("registers no write tool unless writes are enabled", () => {
    expect(collect({ enableWrites: false }).tools.filter((t) => t.write)).toEqual([]);
    const writes = collect().tools.filter((t) => t.write);
    expect(writes).toHaveLength(15);
    for (const tool of writes) expect(tool.shape.confirm.parse(undefined), tool.name).toBe(false);
  });
});

describe("preview versus confirm", () => {
  it("previews a real account without any mutation", async () => {
    const fetcher = vi.fn(async () => account());
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_create_campaign_group", { adAccountId: "1", name: "Draft", runSchedule: { start: 2000000000000 } });
    expect(result.isError).toBeUndefined();
    expect(data).toMatchObject({ applied: false, action: "linkedin_create_campaign_group", activationOffered: false });
    expect(fetcher.mock.calls.every((c) => !isMutation(c))).toBe(true);
  });

  it("creates only a DRAFT after confirmation", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) =>
      init.method === "POST" ? new Response(null, { status: 201, headers: { "x-restli-id": "7" } }) : account(),
    );
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_create_campaign_group", {
      adAccountId: "1",
      name: "test",
      runSchedule: { start: 2000000000000 },
      confirm: true,
    });
    expect(result.isError).toBeUndefined();
    expect(data).toMatchObject({ applied: true, result: { id: "7" } });
    const mutations = fetcher.mock.calls.filter(isMutation);
    expect(mutations).toHaveLength(1);
    expect(JSON.parse(String(requestOf(mutations[0]!).init.body))).toMatchObject({ account: "urn:li:sponsoredAccount:1", status: "DRAFT" });
  });

  it("creates campaigns as DRAFT with audience expansion and the audience network off", async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (init.method === "POST") return new Response(null, { status: 201, headers: { "x-restli-id": "55" } });
      if (url.pathname.endsWith("/adCampaignGroups/3")) return json({ id: 3, account: "urn:li:sponsoredAccount:1" });
      return account();
    });
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_create_campaign", {
      adAccountId: "1",
      name: "Draft campaign",
      campaignGroupId: "3",
      type: "SPONSORED_UPDATES",
      objectiveType: "WEBSITE_VISIT",
      dailyBudget: { amount: "20.00", currencyCode: "EUR" },
      unitCost: { amount: "5", currencyCode: "EUR" },
      costType: "CPC",
      locale: { country: "FR", language: "fr" },
      targetingCriteria: { include: { and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:105015875"] } }] } },
      runSchedule: { start: 2000000000000 },
      politicalIntent: "NOT_POLITICAL",
      confirm: true,
    });
    expect(data.applied).toBe(true);
    const body = JSON.parse(String(requestOf(fetcher.mock.calls.find(isMutation)!).init.body));
    expect(body).toMatchObject({ status: "DRAFT", offsiteDeliveryEnabled: false, audienceExpansionEnabled: false, campaignGroup: "urn:li:sponsoredCampaignGroup:3" });
  });

  it("refuses a currency other than the account's before any mutation", async () => {
    const fetcher = vi.fn(async () => account());
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_update_entity", {
      adAccountId: "1",
      kind: "adCampaigns",
      entityId: "2",
      fields: { dailyBudget: { amount: "10.00", currencyCode: "USD" } },
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(data).toMatchObject({ outcome: "not_applied", retrySafe: true });
    expect(fetcher.mock.calls.some(isMutation)).toBe(false);
  });

  it("flags a budget edit as able to change spend in the preview", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => account()));
    const { data } = await collect().call("linkedin_update_entity", {
      adAccountId: "1",
      kind: "adCampaigns",
      entityId: "2",
      fields: { dailyBudget: { amount: "10.00", currencyCode: "EUR" } },
    });
    expect(data).toMatchObject({ applied: false, mayChangeSpend: true });
  });

  it("rejects activation and unexpected fields before provider calls", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const fields of [{ status: "ACTIVE" }, { intendedStatus: "ACTIVE" }, { budget: 1 }]) {
      const { result } = await collect().call("linkedin_update_entity", { adAccountId: "1", kind: "adCampaigns", entityId: "2", fields, confirm: true });
      expect(result.isError).toBe(true);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("edits text content while preserving the other fields of the owned creative", async () => {
    let patched: any;
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (init.method === "POST") {
        patched = JSON.parse(String(init.body)).patch.$set;
        expect((init.headers as Record<string, string>)["X-RestLi-Method"]).toBe("PARTIAL_UPDATE");
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/adAccounts/1")) return account();
      return json({ account: "urn:li:sponsoredAccount:1", content: { textAd: { headline: "Old", description: "Keep", landingPage: "https://example.com" } } });
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_update_entity", {
      adAccountId: "1",
      kind: "creatives",
      entityId: "9",
      fields: { textAd: { headline: "New" } },
      confirm: true,
    });
    expect(result.isError).toBeUndefined();
    expect(patched.content.textAd).toEqual({ headline: "New", description: "Keep", landingPage: "https://example.com" });
    expect(patched.textAd).toBeUndefined();
  });

  it("renames with the name alone", async () => {
    let patch: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL, init: RequestInit) => {
        if (init.method === "POST") {
          patch = JSON.parse(String(init.body)).patch;
          return new Response(null, { status: 204 });
        }
        return url.pathname.endsWith("/adAccounts/1") ? account() : json({ account: "urn:li:sponsoredAccount:1", name: "New" });
      }),
    );
    await collect().call("linkedin_rename_campaign", { adAccountId: "1", campaignId: "4", name: "New", confirm: true });
    expect(patch).toEqual({ $set: { name: "New" } });
  });

  it.each(["CANCELED", "REMOVED", "PENDING_DELETION"])("refuses %s accounts before mutation", async (status) => {
    const fetcher = vi.fn(async () => account({ status }));
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_rename_ad_account", { adAccountId: "1", name: "x", confirm: true });
    expect(result.isError).toBe(true);
    expect(data.error).toContain(status);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses a mismatched account returned by LinkedIn", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: 2 })));
    const { result } = await collect().call("linkedin_rename_ad_account", { adAccountId: "1", name: "x" });
    expect(result.isError).toBe(true);
  });

  it("refuses a parent that belongs to another account", async () => {
    const fetcher = vi.fn(async (url: URL) => (url.pathname.endsWith("/adAccounts/1") ? account() : json({ account: "urn:li:sponsoredAccount:2" })));
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_duplicate_ad", { adAccountId: "1", sourceCreativeId: "9", campaignId: "4", name: "Copy", confirm: true });
    expect(result.isError).toBe(true);
    expect(data.outcome).toBe("not_applied");
    expect(fetcher.mock.calls.some(isMutation)).toBe(false);
  });

  it("refuses deletion of a non-draft creative", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      url.pathname.endsWith("/adAccounts/1") ? account() : json({ account: "urn:li:sponsoredAccount:1", intendedStatus: "ACTIVE" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_delete_draft_ad", { adAccountId: "1", creativeId: "99", confirm: true });
    expect(result.isError).toBe(true);
    expect(fetcher.mock.calls.some(isMutation)).toBe(false);
  });

  it("deletes a draft with the creative URN key and the Rest.li DELETE header", async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.pathname.endsWith("/adAccounts/1")) return account();
      expect(url.href).toBe("https://api.linkedin.com/rest/adAccounts/1/creatives/urn%3Ali%3AsponsoredCreative%3A99");
      if (init.method === "DELETE") {
        expect((init.headers as Record<string, string>)["X-RestLi-Method"]).toBe("DELETE");
        return new Response(null, { status: 204 });
      }
      return json({ account: "urn:li:sponsoredAccount:1", intendedStatus: "DRAFT" });
    });
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_delete_draft_ad", { adAccountId: "1", creativeId: "99", confirm: true });
    expect(data.applied).toBe(true);
  });

  it("creates a dark sponsored post as DRAFT", async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (init.method === "POST") return json({ value: { creative: "urn:li:sponsoredCreative:99" } });
      if (url.pathname === "/rest/images") {
        return json({ elements: [{ id: "urn:li:image:abc", owner: "urn:li:organization:456", status: "AVAILABLE", mediaLibraryMetadata: { associatedAccount: "urn:li:sponsoredAccount:1" } }] });
      }
      if (url.pathname.endsWith("/adCampaigns/8")) return json({ account: "urn:li:sponsoredAccount:1" });
      return account();
    });
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_create_media_ad", {
      adAccountId: "1",
      name: "Image ad",
      campaignId: "8",
      mediaId: "urn:li:image:abc",
      commentary: "Copy",
      landingPage: "https://example.com/offer",
      confirm: true,
    });
    expect(data).toMatchObject({ applied: true, result: { id: "urn:li:sponsoredCreative:99" } });
    const post = requestOf(fetcher.mock.calls.find(isMutation)!);
    expect(post.url).toBe("https://api.linkedin.com/rest/adAccounts/1/creatives?action=createInline");
    const body = JSON.parse(String(post.init.body)).creative;
    expect(body.intendedStatus).toBe("DRAFT");
    expect(body.inlineContent.post.distribution.feedDistribution).toBe("NONE");
    expect(body.inlineContent.post.author).toBe("urn:li:organization:456");
  });

  it("refuses a read-only grant before a provider call", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect({ scopes: ["r_ads", "r_ads_reporting"] }).call("linkedin_create_campaign_group", {
      adAccountId: "1",
      name: "Draft",
      runSchedule: { start: 2000000000000 },
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(data.error).toContain("rw_ads");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("no automatic write retry", () => {
  it("does not retry a refused confirmed write and asks to verify", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => (init.method === "GET" ? account() : json({ message: "Not enough permissions" }, 403)));
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_create_campaign_group", { adAccountId: "1", name: "Draft", runSchedule: { start: 2000000000000 }, confirm: true });
    expect(result.isError).toBe(true);
    expect(data.outcome).toBe("verify_before_retry");
    expect(fetcher.mock.calls.filter(isMutation)).toHaveLength(1);
  });

  it.each([429, 500, 503])("never retries a failed creation (%s)", async (status) => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => (init.method === "GET" ? account() : json({ message: "failed" }, status)));
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_create_campaign_group", { adAccountId: "1", name: "Draft", runSchedule: { start: 2000000000000 }, confirm: true });
    expect(data.statusCode).toBe(status);
    expect(fetcher.mock.calls.filter(isMutation)).toHaveLength(1);
  });

  it("reports a lost answer as an unknown outcome", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
      if (init.method === "GET") return account();
      throw new TypeError(`fetch failed ${TOKEN}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const { result, data } = await collect().call("linkedin_rename_ad_account", { adAccountId: "1", name: "x", confirm: true });
    expect(data.outcome).toBe("verify_before_retry");
    expect(data.error).toContain("may or may not have been applied");
    expect(fetcher.mock.calls.filter(isMutation)).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe("uploads", () => {
  it("previews without upload and omits the file bytes", async () => {
    const fetcher = vi.fn(async () => account());
    vi.stubGlobal("fetch", fetcher);
    const { data } = await collect().call("linkedin_upload_part", { adAccountId: "1", receipt: "preview", partIndex: 0, bytesBase64: "dGVzdA==" });
    expect(data.applied).toBe(false);
    expect(JSON.stringify(data)).not.toContain("dGVzdA==");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects forged receipts before any binary transfer", async () => {
    const fetcher = vi.fn(async () => account());
    vi.stubGlobal("fetch", fetcher);
    const { result } = await collect().call("linkedin_upload_part", { adAccountId: "1", receipt: "forged.signature", partIndex: 0, bytesBase64: "dGVzdA==", confirm: true });
    expect(result.isError).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uploads an image to the signed LinkedIn URL without any credential", async () => {
    const uploadUrl = "https://www.linkedin.com/dms-uploads/C4E10AQ/uploaded-image/0?ca=vector_ads&ut=sig";
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.href === uploadUrl) return new Response(null, { status: 201 });
      if (init.method === "POST") return json({ value: { image: "urn:li:image:C4E10AQ", uploadUrl, uploadUrlExpiresAt: Date.now() + 60_000 } });
      return account();
    });
    vi.stubGlobal("fetch", fetcher);
    const { call } = collect();
    const init = await call("linkedin_initialize_upload", { adAccountId: "1", kind: "image", name: "banner.png", fileSizeBytes: 4, confirm: true });
    expect(init.data).toMatchObject({ applied: true, mediaId: "urn:li:image:C4E10AQ", parts: [{ index: 0, firstByte: 0, lastByte: 3 }] });
    const body = JSON.parse(String(requestOf(fetcher.mock.calls.find(isMutation)!).init.body));
    expect(body.initializeUploadRequest).toMatchObject({ owner: "urn:li:organization:456", mediaLibraryMetadata: { associatedAccount: "urn:li:sponsoredAccount:1", assetName: "banner.png" } });

    const part = await call("linkedin_upload_part", { adAccountId: "1", receipt: init.data.receipt, partIndex: 0, bytesBase64: "dGVzdA==", confirm: true });
    expect(part.data).toMatchObject({ applied: true, next: "linkedin_get_media" });
    const put = fetcher.mock.calls.map(requestOf).find((r) => r.init.method === "PUT")!;
    expect(put.url).toBe(uploadUrl);
    expect(put.init.redirect).toBe("error");
    expect(JSON.stringify(put.init.headers)).not.toMatch(/authorization/i);

    const wrongLength = await call("linkedin_upload_part", { adAccountId: "1", receipt: init.data.receipt, partIndex: 0, bytesBase64: "dGVzdHg=", confirm: true });
    expect(wrongLength.result.isError).toBe(true);
    const otherAccount = await collect({ allowedAccountIds: ["1", "2"] }).call("linkedin_upload_part", { adAccountId: "2", receipt: init.data.receipt, partIndex: 0, bytesBase64: "dGVzdA==", confirm: true });
    expect(otherAccount.result.isError).toBe(true);
  });

  it("refuses an upload URL outside the LinkedIn upload path, even inside a valid receipt", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) =>
      init.method === "POST" ? json({ value: { image: "urn:li:image:X", uploadUrl: "https://169.254.169.254/latest/meta-data" } }) : account(),
    );
    vi.stubGlobal("fetch", fetcher);
    const { call } = collect();
    const init = await call("linkedin_initialize_upload", { adAccountId: "1", kind: "image", name: "x.png", fileSizeBytes: 4, confirm: true });
    const { result } = await call("linkedin_upload_part", { adAccountId: "1", receipt: init.data.receipt, partIndex: 0, bytesBase64: "dGVzdA==", confirm: true });
    expect(result.isError).toBe(true);
    expect(fetcher.mock.calls.some((c) => requestOf(c).init.method === "PUT")).toBe(false);
  });

  it("finalizes a video only with every signed part, owned by the account organization", async () => {
    const parts = [0, 1].map((i) => ({ uploadUrl: `https://www.linkedin.com/dms-uploads/V/uploadedVideo?part=${i}`, firstByte: i * 4, lastByte: i * 4 + 3 }));
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (init.method === "PUT") return new Response(null, { status: 200, headers: { etag: `etag-${url.searchParams.get("part")}` } });
      if (init.method === "POST" && url.search.includes("initializeUpload")) {
        return json({ value: { video: "urn:li:video:V", uploadInstructions: parts, uploadToken: "tok", uploadUrlsExpireAt: Date.now() + 60_000 } });
      }
      if (init.method === "POST") return new Response(null, { status: 200 });
      if (url.pathname.startsWith("/rest/videos/")) return json({ owner: "urn:li:organization:456" });
      return account();
    });
    vi.stubGlobal("fetch", fetcher);
    const { call } = collect();
    const init = await call("linkedin_initialize_upload", { adAccountId: "1", kind: "video", name: "clip.mp4", fileSizeBytes: 8, confirm: true });
    const receipts: string[] = [];
    for (const index of [0, 1]) {
      const part = await call("linkedin_upload_part", { adAccountId: "1", receipt: init.data.receipt, partIndex: index, bytesBase64: "dGVzdA==", confirm: true });
      receipts.push(part.data.partReceipt);
    }
    const missing = await call("linkedin_finalize_upload", { adAccountId: "1", receipt: init.data.receipt, partReceipts: [receipts[0]], confirm: true });
    expect(missing.result.isError).toBe(true);
    const done = await call("linkedin_finalize_upload", { adAccountId: "1", receipt: init.data.receipt, partReceipts: [receipts[1], receipts[0]], confirm: true });
    expect(done.data.applied).toBe(true);
    const finalize = fetcher.mock.calls.map(requestOf).find((r) => r.url.includes("finalizeUpload"))!;
    expect(JSON.parse(String(finalize.init.body)).finalizeUploadRequest).toEqual({ video: "urn:li:video:V", uploadToken: "tok", uploadedPartIds: ["etag-0", "etag-1"] });
  });

  it("refuses video finalization for another organization", async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (init.method === "PUT") return new Response(null, { status: 200, headers: { etag: "e" } });
      if (init.method === "POST") {
        return json({ value: { video: "urn:li:video:V", uploadInstructions: [{ uploadUrl: "https://www.linkedin.com/dms-uploads/V/x", firstByte: 0, lastByte: 3 }], uploadToken: "" } });
      }
      if (url.pathname.startsWith("/rest/videos/")) return json({ owner: "urn:li:organization:999" });
      return account();
    });
    vi.stubGlobal("fetch", fetcher);
    const { call } = collect();
    const init = await call("linkedin_initialize_upload", { adAccountId: "1", kind: "video", name: "clip.mp4", fileSizeBytes: 4, confirm: true });
    const part = await call("linkedin_upload_part", { adAccountId: "1", receipt: init.data.receipt, partIndex: 0, bytesBase64: "dGVzdA==", confirm: true });
    const { result, data } = await call("linkedin_finalize_upload", { adAccountId: "1", receipt: init.data.receipt, partReceipts: [part.data.partReceipt], confirm: true });
    expect(result.isError).toBe(true);
    expect(data.outcome).toBe("not_applied");
    expect(fetcher.mock.calls.filter((c) => requestOf(c).url.includes("finalizeUpload"))).toHaveLength(0);
  });
});

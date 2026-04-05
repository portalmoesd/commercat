import { createHash } from "crypto";
import type { NormalisedProduct, Platform } from "@/types";
import { redis } from "./redis";

const RAPIDAPI_HOST = "otapi-1688.p.rapidapi.com";
const CACHE_TTL = 6 * 60 * 60; // 6 hours
const MAX_RETRIES = 2;

function getHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-rapidapi-host": RAPIDAPI_HOST,
    "x-rapidapi-key": process.env.RAPIDAPI_KEY || "",
  };
}

/** Fetch with retry for transient errors */
async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, { headers: getHeaders() });

    if (response.ok) return response;

    if (response.status < 500) {
      const body = await response.text().catch(() => "");
      throw new Error(`API ${response.status}: ${body.slice(0, 300)}`);
    }

    const body = await response.text().catch(() => "");
    console.error(
      `API ${response.status} (attempt ${attempt + 1}/${retries + 1}): ${body.slice(0, 300)}`
    );

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    } else {
      throw new Error(
        `API failed after ${retries + 1} attempts: ${response.status} — ${body.slice(0, 200)}`
      );
    }
  }
  throw new Error("API: unexpected retry exit");
}

// ── Search ──

export async function searchByKeyword(
  keyword: string,
  _platform: Platform = "1688",
  _page = 1,
  limit = 20
): Promise<NormalisedProduct[]> {
  // Check cache
  const cached = await getCachedResults(keyword, "1688");
  if (cached) return cached;

  const params = new URLSearchParams({
    language: "en",
    framePosition: "0",
    frameSize: String(Math.min(limit, 50)),
    ItemTitle: keyword,
    OrderBy: "Popularity:Desc",
  });

  const url = `https://${RAPIDAPI_HOST}/BatchSearchItemsFrame?${params}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();

  // OTAPI response: Result.Items.Items.Content[]
  const rawItems: unknown[] =
    data.Result?.Items?.Items?.Content ??
    data.OtapiItemInfoList ??
    [];

  const normalised = rawItems.map((item) => normalise(item, "1688"));

  if (normalised.length > 0) {
    await setCachedResults(keyword, "1688", normalised);
  }

  return normalised;
}

export async function searchByImage(
  imageUrl: string,
  _platform: Platform = "1688"
): Promise<NormalisedProduct[]> {
  const params = new URLSearchParams({
    language: "en",
    framePosition: "0",
    frameSize: "20",
    ImageUrl: imageUrl,
    OrderBy: "Popularity:Desc",
  });

  const url = `https://${RAPIDAPI_HOST}/BatchSearchItemsFrame?${params}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();

  const rawItems: unknown[] =
    data.Result?.Items?.Items?.Content ??
    data.OtapiItemInfoList ??
    [];

  return rawItems.map((item) => normalise(item, "1688"));
}

export async function getProductDetail(
  itemId: string,
  _platform: Platform = "1688"
): Promise<NormalisedProduct> {
  const params = new URLSearchParams({
    language: "en",
    itemId,
  });

  const url = `https://${RAPIDAPI_HOST}/BatchGetItemFullInfo?${params}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();

  const item = data.OtapiItemInfoList?.[0] ?? data.Result ?? data;
  return normalise(item, "1688");
}

// ── Normalisation (handles OTAPI response format) ──

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalise(raw: any, platform: Platform): NormalisedProduct {
  // OTAPI response fields: Id (e.g. "abb-778031163622"), strip "abb-" prefix
  const rawId = String(raw.Id ?? raw.ExternalItemId ?? raw.item_id ?? raw.id ?? "");
  const id = rawId.replace(/^abb-/, "");

  // Price — OTAPI: Price.OriginalPrice (number, CNY)
  const priceCny = parseFloat(
    raw.Price?.OriginalPrice ?? raw.Price?.MarginPrice ?? raw.price ?? "0"
  );

  // Image
  const imageUrl = raw.MainPictureUrl ?? raw.img ?? raw.image_url ?? "";

  // Title — OTAPI has Title (translated) and OriginalTitle (Chinese)
  const titleCn = raw.OriginalTitle ?? raw.Title ?? raw.title ?? "";

  // Use the external URL directly if available
  const productUrl = raw.ExternalItemUrl ?? raw.TaobaoItemUrl ?? buildProductUrl(platform, id);

  return {
    id,
    title_cn: titleCn,
    price_cny: priceCny,
    cn_shipping_cny: 0,
    image_url: imageUrl,
    product_url: productUrl,
    shop_name: raw.VendorName ?? raw.VendorDisplayName ?? "",
    platform,
    sales_count: parseInt(raw.Volume ?? raw.FeedbackCount ?? "0", 10),
    skus: [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function buildProductUrl(platform: Platform, itemId: string): string {
  const urls: Record<Platform, string> = {
    taobao: `https://item.taobao.com/item.htm?id=${itemId}`,
    tmall: `https://detail.tmall.com/item.htm?id=${itemId}`,
    "1688": `https://detail.1688.com/offer/${itemId}.html`,
    pinduoduo: `https://mobile.yangkeduo.com/goods.html?goods_id=${itemId}`,
  };
  return urls[platform];
}

// ── Caching ──

function cacheKey(query: string, platform: string): string {
  const hash = createHash("sha256")
    .update(`${query}:${platform}`)
    .digest("hex");
  return `search:${hash}`;
}

async function getCachedResults(
  query: string,
  platform: string
): Promise<NormalisedProduct[] | null> {
  try {
    const cached = await redis.get<NormalisedProduct[]>(cacheKey(query, platform));
    return cached ?? null;
  } catch {
    return null;
  }
}

async function setCachedResults(
  query: string,
  platform: string,
  results: NormalisedProduct[]
): Promise<void> {
  try {
    await redis.set(cacheKey(query, platform), results, { ex: CACHE_TTL });
  } catch {
    // Redis unavailable — skip cache
  }
}

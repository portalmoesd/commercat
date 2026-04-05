import { createHash } from "crypto";
import type { NormalisedProduct, Platform } from "@/types";
import { redis } from "./redis";

// ── API Hosts ──
const OTAPI_1688_HOST = "otapi-1688.p.rapidapi.com";
const TAOBAO_OPEN_HOST = "toabao-open-api.p.rapidapi.com"; // note: "toabao" is their typo

const CACHE_TTL = 6 * 60 * 60; // 6 hours
const MAX_RETRIES = 2;

function getHeaders(host: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-rapidapi-host": host,
    "x-rapidapi-key": process.env.RAPIDAPI_KEY || "",
  };
}

/** Fetch with retry for transient errors */
async function fetchWithRetry(
  url: string,
  host: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, { headers: getHeaders(host) });

    if (response.ok) return response;

    // 429 = rate limited, treat as retryable
    if (response.status !== 429 && response.status < 500) {
      const body = await response.text().catch(() => "");
      throw new Error(`API ${response.status}: ${body.slice(0, 300)}`);
    }

    const body = await response.text().catch(() => "");
    console.error(
      `API ${response.status} (attempt ${attempt + 1}/${retries + 1}): ${body.slice(0, 300)}`
    );

    if (attempt < retries) {
      // Longer wait for rate limits
      const delay = response.status === 429 ? (attempt + 1) * 2000 : (attempt + 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw new Error(
        `API failed after ${retries + 1} attempts: ${response.status} — ${body.slice(0, 200)}`
      );
    }
  }
  throw new Error("API: unexpected retry exit");
}

/** Parse OTAPI response format (shared by both APIs) */
function parseOtapiItems(data: Record<string, unknown>): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return d.Result?.Items?.Items?.Content ?? d.OtapiItemInfoList ?? [];
}

// ── Search ──

/** Search 1688 by keyword */
async function search1688(keyword: string, limit = 20): Promise<NormalisedProduct[]> {
  const params = new URLSearchParams({
    language: "en",
    framePosition: "0",
    frameSize: String(Math.min(limit, 50)),
    ItemTitle: keyword,
    OrderBy: "Popularity:Desc",
  });

  const url = `https://${OTAPI_1688_HOST}/BatchSearchItemsFrame?${params}`;
  const response = await fetchWithRetry(url, OTAPI_1688_HOST);
  const data = await response.json();
  return parseOtapiItems(data).map((item) => normalise(item, "1688"));
}

/** Search Taobao/Tmall by keyword */
async function searchTaobao(keyword: string, limit = 20): Promise<NormalisedProduct[]> {
  const params = new URLSearchParams({
    language: "en",
    framePosition: "0",
    frameSize: String(Math.min(limit, 50)),
    ItemTitle: keyword,
    OrderBy: "Popularity:Desc",
  });

  const url = `https://${TAOBAO_OPEN_HOST}/BatchSearchItemsFrame?${params}`;
  const response = await fetchWithRetry(url, TAOBAO_OPEN_HOST);
  const data = await response.json();
  return parseOtapiItems(data).map((item) => normalise(item, "taobao"));
}

/**
 * Search across both 1688 AND Taobao/Tmall, return combined results.
 * Each search runs in parallel for speed.
 */
export async function searchByKeyword(
  keyword: string,
  _platform: Platform = "1688",
  _page = 1,
  limit = 20
): Promise<NormalisedProduct[]> {
  // Check cache
  const cached = await getCachedResults(keyword, "all");
  if (cached) return cached;

  // Search both platforms in parallel
  const [results1688, resultsTaobao] = await Promise.allSettled([
    search1688(keyword, limit),
    searchTaobao(keyword, limit),
  ]);

  const products: NormalisedProduct[] = [];

  if (results1688.status === "fulfilled") {
    products.push(...results1688.value);
  } else {
    console.error("1688 search failed:", results1688.reason);
  }

  if (resultsTaobao.status === "fulfilled") {
    products.push(...resultsTaobao.value);
  } else {
    console.error("Taobao search failed:", resultsTaobao.reason);
  }

  if (products.length > 0) {
    await setCachedResults(keyword, "all", products);
  }

  return products;
}

/**
 * Image search: use Taobao Open API with keyword + image URL.
 * The Taobao API requires ItemTitle alongside ImageUrl, so we
 * need a text description too (provided by Claude's image analysis).
 */
export async function searchByImage(
  imageUrl: string,
  _platform: Platform = "taobao",
  keyword?: string
): Promise<NormalisedProduct[]> {
  const params = new URLSearchParams({
    language: "en",
    framePosition: "0",
    frameSize: "20",
    OrderBy: "Popularity:Desc",
  });

  // Taobao API requires at least ItemTitle alongside ImageUrl
  if (keyword) {
    params.set("ItemTitle", keyword);
  }
  params.set("ImageUrl", imageUrl);

  const url = `https://${TAOBAO_OPEN_HOST}/BatchSearchItemsFrame?${params}`;
  const response = await fetchWithRetry(url, TAOBAO_OPEN_HOST);
  const data = await response.json();
  return parseOtapiItems(data).map((item) => normalise(item, "taobao"));
}

export async function getProductDetail(
  itemId: string,
  platform: Platform = "1688"
): Promise<NormalisedProduct> {
  const host = platform === "taobao" || platform === "tmall"
    ? TAOBAO_OPEN_HOST
    : OTAPI_1688_HOST;

  const params = new URLSearchParams({
    language: "en",
    itemId,
  });

  const url = `https://${host}/BatchGetItemFullInfo?${params}`;
  const response = await fetchWithRetry(url, host);
  const data = await response.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = (data as any).OtapiItemInfoList?.[0] ?? (data as any).Result ?? data;
  return normalise(item, platform);
}

// ── Normalisation (handles OTAPI response format from both APIs) ──

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalise(raw: any, platform: Platform): NormalisedProduct {
  const rawId = String(raw.Id ?? raw.ExternalItemId ?? raw.item_id ?? raw.id ?? "");
  const id = rawId.replace(/^abb-/, "");

  const priceCny = parseFloat(
    raw.Price?.OriginalPrice ?? raw.Price?.MarginPrice ?? raw.price ?? "0"
  );

  const imageUrl = raw.MainPictureUrl ?? raw.img ?? raw.image_url ?? "";

  // Detect platform from ProviderType if available
  let detectedPlatform = platform;
  if (raw.ProviderType === "Taobao") detectedPlatform = "taobao";
  else if (raw.ProviderType === "Tmall") detectedPlatform = "tmall";
  else if (raw.ProviderType === "Alibaba1688") detectedPlatform = "1688";

  const titleCn = raw.OriginalTitle ?? raw.Title ?? raw.title ?? "";
  const productUrl = raw.ExternalItemUrl ?? raw.TaobaoItemUrl ?? buildProductUrl(detectedPlatform, id);

  return {
    id,
    title_cn: titleCn,
    price_cny: priceCny,
    cn_shipping_cny: 0,
    image_url: imageUrl,
    product_url: productUrl,
    shop_name: raw.VendorName ?? raw.VendorDisplayName ?? "",
    platform: detectedPlatform,
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

import { createHash } from "crypto";
import type { NormalisedProduct, Platform } from "@/types";
import { redis } from "./redis";

const TMAPI_BASE = "https://api.tmapi.io";
const CACHE_TTL = 6 * 60 * 60; // 6 hours
const MAX_RETRIES = 2;

function getApiToken(): string {
  return process.env.TMAPI_KEY || process.env.ELIMAPI_KEY || "";
}

/** Fetch with retry for transient errors */
async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url);

    if (response.ok) return response;

    if (response.status < 500) {
      const body = await response.text().catch(() => "");
      throw new Error(`TMAPI ${response.status}: ${body.slice(0, 300)}`);
    }

    const body = await response.text().catch(() => "");
    console.error(
      `TMAPI ${response.status} (attempt ${attempt + 1}/${retries + 1}): ${body.slice(0, 300)}`
    );

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    } else {
      throw new Error(
        `TMAPI failed after ${retries + 1} attempts: ${response.status} — ${body.slice(0, 200)}`
      );
    }
  }
  throw new Error("TMAPI: unexpected retry exit");
}

// ── Search ──

export async function searchByKeyword(
  keyword: string,
  platform: Platform = "1688",
  page = 1,
  limit = 20
): Promise<NormalisedProduct[]> {
  // Check cache
  const cached = await getCachedResults(keyword, platform);
  if (cached) return cached;

  // TMAPI search is available for 1688 — use it for all searches
  const url = `${TMAPI_BASE}/1688/search/items?apiToken=${encodeURIComponent(getApiToken())}&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${Math.min(limit, 20)}&sort=default`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  const items: unknown[] = data.data?.items ?? data.items ?? data.result ?? [];
  const normalised = items.map((item) => normalise(item, "1688"));

  if (normalised.length > 0) {
    await setCachedResults(keyword, platform, normalised);
  }

  return normalised;
}

export async function searchByImage(
  imageUrl: string,
  platform: Platform = "1688"
): Promise<NormalisedProduct[]> {
  const url = `${TMAPI_BASE}/1688/search/image?apiToken=${encodeURIComponent(getApiToken())}&img_url=${encodeURIComponent(imageUrl)}&page=1&page_size=20&sort=default`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  const items: unknown[] = data.data?.items ?? data.items ?? data.result ?? [];
  return items.map((item) => normalise(item, "1688"));
}

export async function getProductDetail(
  itemId: string,
  platform: Platform = "1688"
): Promise<NormalisedProduct> {
  const platformPath = platform === "taobao" || platform === "tmall" ? "taobao" : "1688";
  const url = `${TMAPI_BASE}/${platformPath}/item_detail?apiToken=${encodeURIComponent(getApiToken())}&item_id=${itemId}`;

  const response = await fetchWithRetry(url);
  const data = await response.json();

  const item = data.data ?? data.item ?? data.result ?? data;
  return normalise(item, platform);
}

// ── Normalisation (handles both TMAPI and Elimapi response formats) ──

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalise(raw: any, platform: Platform): NormalisedProduct {
  // TMAPI uses different field names than Elimapi
  const id = String(raw.item_id ?? raw.id ?? raw.num_iid ?? raw.offer_id ?? "");
  const priceCny = parseFloat(
    raw.price ?? raw.min_price ?? raw.sale_price ??
    raw.price_info?.price ?? raw.price_info?.min_price ?? "0"
  );

  // TMAPI image field
  const imageUrl = raw.img ?? raw.image_url ?? raw.pic_url ??
    raw.main_imgs?.[0] ?? raw.images?.[0] ?? "";

  return {
    id,
    title_cn: raw.title ?? "",
    price_cny: priceCny,
    cn_shipping_cny: parseFloat(raw.post_fee ?? raw.shipping ?? "0"),
    image_url: imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl,
    product_url: buildProductUrl(platform, id),
    shop_name: raw.shop_name ?? raw.seller_nick ?? raw.nick ??
      raw.shop_info?.shop_name ?? "",
    platform,
    sales_count: parseInt(
      raw.sale_info?.sale_count ?? raw.comment_count ?? raw.sales ??
      raw.volume ?? "0", 10
    ),
    skus: raw.skus ?? raw.sku?.list ?? [],
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

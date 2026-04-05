import { createHash } from "crypto";
import type { NormalisedProduct, Platform } from "@/types";
import { redis } from "./redis";

const ELIMAPI_BASE = "https://api.elim.asia/v2";
const CACHE_TTL = 6 * 60 * 60; // 6 hours in seconds

function getHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.ELIMAPI_KEY}`,
  };
}

// ── Search ──

export async function searchByKeyword(
  keyword: string,
  platform: Platform = "taobao",
  page = 1,
  limit = 20
): Promise<NormalisedProduct[]> {
  // Check cache
  const cached = await getCachedResults(keyword, platform);
  if (cached) return cached;

  const response = await fetch(`${ELIMAPI_BASE}/item_search`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ keyword, platform, page, limit }),
  });

  if (!response.ok) {
    throw new Error(`Elimapi search failed: ${response.status}`);
  }

  const data = await response.json();
  const items: unknown[] = data.items ?? data.result ?? data.data ?? [];
  const normalised = items.map((item) => normalise(item, platform));

  // Cache results
  await setCachedResults(keyword, platform, normalised);

  return normalised;
}

export async function searchByImage(
  imageUrl: string,
  platform: Platform = "taobao"
): Promise<NormalisedProduct[]> {
  const response = await fetch(`${ELIMAPI_BASE}/item_search_img`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ image_url: imageUrl, platform }),
  });

  if (!response.ok) {
    throw new Error(`Elimapi image search failed: ${response.status}`);
  }

  const data = await response.json();
  const items: unknown[] = data.items ?? data.result ?? data.data ?? [];
  return items.map((item) => normalise(item, platform));
}

export async function getProductDetail(
  itemId: string,
  platform: Platform = "taobao"
): Promise<NormalisedProduct> {
  const response = await fetch(
    `${ELIMAPI_BASE}/item_get?item_id=${itemId}&platform=${platform}`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    throw new Error(`Elimapi detail failed: ${response.status}`);
  }

  const data = await response.json();
  const item = data.item ?? data.result ?? data.data ?? data;
  return normalise(item, platform);
}

// ── Normalisation ──

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalise(raw: any, platform: Platform): NormalisedProduct {
  return {
    id: String(raw.item_id ?? raw.id ?? raw.num_iid ?? ""),
    title_cn: raw.title ?? "",
    price_cny: parseFloat(raw.price ?? raw.min_price ?? raw.sale_price ?? "0"),
    cn_shipping_cny: parseFloat(raw.post_fee ?? raw.shipping ?? "0"),
    image_url: raw.image_url ?? raw.pic_url ?? raw.main_imgs?.[0] ?? raw.images?.[0] ?? "",
    product_url: buildProductUrl(platform, String(raw.item_id ?? raw.id ?? raw.num_iid ?? "")),
    shop_name: raw.shop_name ?? raw.seller_nick ?? raw.nick ?? "",
    platform,
    sales_count: parseInt(raw.comment_count ?? raw.sales ?? raw.volume ?? "0", 10),
    skus: raw.skus ?? [],
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
  const cached = await redis.get<NormalisedProduct[]>(cacheKey(query, platform));
  return cached ?? null;
}

async function setCachedResults(
  query: string,
  platform: string,
  results: NormalisedProduct[]
): Promise<void> {
  await redis.set(cacheKey(query, platform), results, { ex: CACHE_TTL });
}

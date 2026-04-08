import { createHash } from "crypto";
import type { NormalisedProduct, Platform, ProductDetailData } from "@/types";
import { redis } from "./redis";

const ELIMAPI_BASE = "https://openapi.elim.asia/v1";
const CACHE_TTL = 6 * 60 * 60; // 6 hours
const MAX_RETRIES = 2;

// ── Auth: auto-login to get fresh JWT ──

let cachedJwt: string | null = null;
let jwtExpiresAt = 0;

async function getAuthHeader(): Promise<string> {
  // Use env JWT if set and no auto-login credentials
  if (!process.env.ELIMAPI_EMAIL && process.env.ELIMAPI_JWT) {
    return `Bearer ${process.env.ELIMAPI_JWT}`;
  }

  // Return cached JWT if still valid (with 5 min buffer)
  if (cachedJwt && Date.now() / 1000 < jwtExpiresAt - 300) {
    return `Bearer ${cachedJwt}`;
  }

  // Login to get fresh JWT
  const response = await fetch(`${ELIMAPI_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ELIMAPI_EMAIL!,
      password: process.env.ELIMAPI_PASSWORD!,
    }),
  });

  if (!response.ok) {
    throw new Error(`Elimapi login failed: ${response.status}`);
  }

  const data = await response.json();
  cachedJwt = data.access_token;
  jwtExpiresAt = data.expires_in;

  return `Bearer ${cachedJwt}`;
}

/** Map our platform names to Elimapi's */
function toElimPlatform(platform: Platform): "taobao" | "alibaba" {
  if (platform === "1688") return "alibaba";
  return "taobao"; // taobao, tmall, pinduoduo all use "taobao"
}

/** Fetch with retry */
async function fetchWithRetry(
  url: string,
  body: object,
  retries = MAX_RETRIES
): Promise<Response> {
  const authHeader = await getAuthHeader();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    // If 401, clear cached JWT and retry with fresh login
    if (response.status === 401 && attempt < retries) {
      cachedJwt = null;
      jwtExpiresAt = 0;
      const freshAuth = await getAuthHeader();
      const retryResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: freshAuth,
        },
        body: JSON.stringify(body),
      });
      if (retryResponse.ok) return retryResponse;
    }

    if (response.ok) return response;

    if (response.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
      continue;
    }

    if (response.status < 500) {
      const text = await response.text().catch(() => "");
      throw new Error(`Elimapi ${response.status}: ${text.slice(0, 300)}`);
    }

    const text = await response.text().catch(() => "");
    console.error(`Elimapi ${response.status} (attempt ${attempt + 1}): ${text.slice(0, 300)}`);

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    } else {
      throw new Error(`Elimapi failed after ${retries + 1} attempts: ${response.status}`);
    }
  }
  throw new Error("Elimapi: unexpected retry exit");
}

// ── Search ──

export async function searchByKeyword(
  keyword: string,
  platform: Platform = "taobao",
  _page = 1,
  limit = 20
): Promise<NormalisedProduct[]> {
  const cached = await getCachedResults(keyword, platform);
  if (cached) return cached;

  const response = await fetchWithRetry(`${ELIMAPI_BASE}/products/search`, {
    q: keyword,
    platform: toElimPlatform(platform),
    page: 1,
    size: Math.min(limit, 50),
    lang: "en",
    sort: "SALE_QTY_DESC",
  });

  const data = await response.json();
  const items = data.items ?? [];
  const normalised = items.map((item: ElimSearchItem) =>
    normaliseSearchItem(item, platform)
  );

  if (normalised.length > 0) {
    await setCachedResults(keyword, platform, normalised);
  }

  return normalised;
}

export async function searchByImage(
  imageSource: string,
  platform: Platform = "taobao",
): Promise<NormalisedProduct[]> {
  // Step 1: Upload image to get an Elimapi image_id
  const imageId = await uploadImageToElim(imageSource, platform);

  // Step 2: Search with the image_id
  const response = await fetchWithRetry(`${ELIMAPI_BASE}/products/search-img`, {
    img_id: imageId,
    platform: toElimPlatform(platform),
    page: 1,
    size: 20,
    lang: "en",
  });

  const data = await response.json();
  const items = data.items ?? [];
  return items.map((item: ElimSearchItem) =>
    normaliseSearchItem(item, platform)
  );
}

export async function getProductDetail(
  itemId: string,
  platform: Platform = "taobao"
): Promise<NormalisedProduct> {
  const detail = await getProductDetailFull(itemId, platform);
  return detail.product;
}

export async function getProductDetailFull(
  itemId: string,
  platform: Platform = "taobao"
): Promise<{
  product: NormalisedProduct;
  pictures: string[];
  description: string;
}> {
  const response = await fetchWithRetry(`${ELIMAPI_BASE}/products/find`, {
    id: itemId,
    platform: toElimPlatform(platform),
    lang: "en",
  });

  const data = await response.json();

  const product: NormalisedProduct = {
    id: String(data.id ?? itemId),
    title_cn: data.title ?? "",
    price_cny: parseFloat(data.price ?? data.promotion_price ?? "0"),
    cn_shipping_cny: 0,
    image_url: data.img_urls?.[0] ?? "",
    product_url: `https://item.taobao.com/item.htm?id=${data.id ?? itemId}`,
    shop_name: data.shop_name ?? "",
    platform,
    sales_count: parseInt(data.sold ?? "0", 10),
    skus: (data.skus ?? []).map((sku: ElimSku) => ({
      size: sku.spec_name ?? sku.name,
      color: undefined,
      price: sku.price ? parseFloat(String(sku.price)) : undefined,
    })),
  };

  return {
    product,
    pictures: data.img_urls ?? [],
    description: data.description ?? "",
  };
}

// ── Upload image to Elimapi ──

/**
 * Upload an image to Elimapi and return the image_id for visual search.
 * Accepts either a URL (will be fetched) or raw base64 data.
 */
async function uploadImageToElim(
  imageSource: string,
  platform: Platform = "taobao"
): Promise<string> {
  const formData = new FormData();

  let blob: Blob;
  let filename = "search-image.jpg";

  if (imageSource.startsWith("data:")) {
    // Base64 data URL
    const base64Data = imageSource.split(",")[1];
    const mimeMatch = imageSource.match(/data:([^;]+);/);
    const mimeType = mimeMatch?.[1] ?? "image/jpeg";
    const ext = mimeType.split("/")[1] ?? "jpg";
    filename = `search-image.${ext}`;
    blob = new Blob([Buffer.from(base64Data, "base64")], { type: mimeType });
  } else if (imageSource.length > 200 && !imageSource.startsWith("http")) {
    // Raw base64 string (no data: prefix)
    blob = new Blob([Buffer.from(imageSource, "base64")], { type: "image/jpeg" });
  } else {
    // URL — fetch and convert to blob
    const imageResponse = await fetch(imageSource);
    blob = await imageResponse.blob();
  }

  formData.append("file", blob, filename);
  formData.append("platform", toElimPlatform(platform));

  const authHeader = await getAuthHeader();
  const response = await fetch(`${ELIMAPI_BASE}/products/upload-image`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Elimapi image upload failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const imageId = data.data?.image_id ?? data.image_id;

  if (!imageId) {
    throw new Error("Elimapi image upload: no image_id in response");
  }

  return String(imageId);
}

// ── Normalisation ──

interface ElimSearchItem {
  id: number | string;
  title?: string;
  titleEn?: string;
  price?: number;
  promotion_price?: number;
  img_url?: string;
  link?: string;
  sales_volume?: number;
  seller_type?: string;
  shop_name?: string;
}

interface ElimSku {
  spec_name?: string;
  name?: string;
  price?: string | number;
}

function normaliseSearchItem(
  raw: ElimSearchItem,
  platform: Platform
): NormalisedProduct {
  const id = String(raw.id);

  return {
    id,
    title_cn: raw.titleEn ?? raw.title ?? "",
    price_cny: typeof raw.promotion_price === 'number' ? raw.promotion_price : (typeof raw.price === 'number' ? raw.price : 0),
    cn_shipping_cny: 0,
    image_url: raw.img_url ?? "",
    product_url: raw.link ?? buildProductUrl(platform, id),
    shop_name: raw.shop_name ?? "",
    platform,
    sales_count: raw.sales_volume ?? 0,
    skus: [],
  };
}

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
    // Redis unavailable
  }
}

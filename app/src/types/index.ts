// ── Subscription & Order Status ──

export type SubscriptionTier = "free" | "starter" | "pro" | "elite";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "purchasing"
  | "purchased"
  | "shipped"
  | "at_warehouse"
  | "cancelled"
  | "refunded";

export type Platform = "taobao" | "1688" | "tmall" | "pinduoduo";

// ── User ──

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  preferred_forwarder: "mygeo" | "express_georgia" | "custom" | null;
  forwarder_address: string | null;
  size_profile: Record<string, string>;
  subscription_tier: SubscriptionTier;
  subscription_expires: string | null;
  wallet_balance_gel: number;
  trial_claimed: boolean;
  trial_claimed_at: string | null;
  preferred_currency: string; // ISO 4217 code, e.g. "USD"
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

// ── Orders ──

export interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  item_cost_gel: number;
  commission_gel: number;
  total_gel: number;
  fx_rate_used: number; // CNY/GEL rate at order time
  display_currency: string; // user's currency at order time
  display_fx_rate: number; // CNY/user-currency rate at order time
  bog_payment_id: string | null;
  bog_payment_status: string | null;
  taobao_order_id: string | null;
  tracking_number: string | null;
  forwarder_address: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  platform: Platform;
  title_en: string;
  title_cn: string | null;
  image_url: string | null;
  product_url: string;
  price_cny: number;
  price_gel: number;
  quantity: number;
  variant: Record<string, string>;
  created_at: string;
}

// ── Products (from Elimapi) ──

export interface NormalisedProduct {
  id: string;
  title_cn: string;
  price_cny: number;
  cn_shipping_cny: number;
  image_url: string;
  product_url: string;
  shop_name: string;
  platform: Platform;
  sales_count: number;
  skus: ProductSku[];
}

export interface ProductSku {
  size?: string;
  color?: string;
  price?: number;
}

/** Product after Claude filtering + pricing engine */
export interface ProcessedProduct {
  id: string;
  platform: Platform;
  title_en: string;
  title_cn: string;
  image_url: string;
  product_url: string;
  price_cny: number;
  item_cost_local: number;
  commission_local: number;
  total_local: number;
  currency: string;
  skus: ProductSku[];
  branded: boolean;
  relevance_score: number;
}

// ── Chat ──

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ProcessedProduct[];
  tracking_info?: OrderTracking;
  is_search_limit?: boolean;
  timestamp: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

// ── Order Tracking ──

export interface OrderTracking {
  order_id: string;
  order_number: string; // COM-XXXXXX
  status: OrderStatus;
  tracking_number: string | null;
  image_url: string | null;
  title_en: string;
  created_at: string;
  updated_at: string;
}

// ── Currency ──

export interface CurrencyInfo {
  code: string; // ISO 4217, e.g. "USD"
  symbol: string; // e.g. "$"
  name: string; // e.g. "US Dollar"
}

export interface FxRates {
  rates: Record<string, number>; // currency code → rate (1 CNY = X local)
  base: "CNY";
  updated_at: string;
}

// ── Forwarder ──

export interface Forwarder {
  id: string;
  name: string;
  cn_address: string;
  referral_fee_usd: number | null;
  active: boolean;
  created_at: string;
}

// ── Pricing ──

export interface PriceBreakdown {
  item_cost: number;
  commission: number;
  total: number;
  currency: string;
}

// ── Search ──

export interface SearchResponse {
  products: ProcessedProduct[];
  cached: boolean;
  query_cn: string[];
}

export interface SearchLimitStatus {
  allowed: boolean;
  count: number;
  limit: number;
  show_upgrade_prompt: boolean;
}

# Commercat — Complete Developer Specification
## Version 2.0 | April 2026

> **Purpose of this document:** Hand this to a developer (or AI coding agent) as the single source of truth for building the Commercat platform. Every architectural decision, data model, API route, pricing formula, and build order is defined here. Nothing should require follow-up questions.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Pricing Engine](#5-pricing-engine)
6. [API Routes](#6-api-routes)
7. [Claude AI Integration](#7-claude-ai-integration)
8. [Payment Flow — BOG Pay](#8-payment-flow--bog-pay)
9. [Search Limits & Subscription Tiers](#9-search-limits--subscription-tiers)
10. [Frontend Components](#10-frontend-components)
11. [Admin Panel](#11-admin-panel)
12. [Elimapi Integration](#12-elimapi-integration)
13. [Environment Variables](#13-environment-variables)
14. [Build Order](#14-build-order)
15. [Business Rules & Constraints](#15-business-rules--constraints)

---

## 1. Project Overview

Commercat is a **chat-first AI personal shopping platform** that helps users find and purchase products from Chinese marketplaces — Taobao, Tmall, 1688, and Pinduoduo — with pricing displayed in the user's local currency and delivery to their freight forwarder's China warehouse.

### What it does
1. User opens the chat and describes what they want OR uploads a photo
2. AI translates the request into Chinese search terms and queries Elimapi
3. Results appear as product cards inside the chat within 2 seconds
4. User selects a product, variant (size/colour), and pays via BOG Pay
5. Commercat ops team purchases the item on Taobao **in the user's name**, to their freight forwarder's China warehouse address
6. User tracks the order via chat. Commercat's responsibility ends at the China warehouse.

### Critical business rule — Agency Model
**Commercat acts as a purchasing agent, NOT a reseller.** Every order is placed in the user's name, to the user's personal freight forwarder cabinet address. This is not optional — it is a legal and tax structure that means VAT applies only to Commercat's commission (the service fee), not to the full value of goods. Every purchase record must show the user as the buyer. The two-line price display (item cost + service fee shown separately) is a mandatory requirement that supports this structure.

### Scope
- ✅ Finding products via text or photo
- ✅ Purchasing items in user's name on Taobao/1688
- ✅ Delivering to freight forwarder's China warehouse
- ✅ Tracking 4 statuses: Paid → Purchased → Shipped → At warehouse
- ❌ International shipping (freight forwarder handles this)
- ❌ Customs clearance
- ❌ Home delivery (future consideration)
- ❌ Mobile apps (web-first, mobile-responsive)

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 (App Router) | TypeScript, Tailwind CSS |
| Backend | Next.js API routes (serverless) | No separate Express server |
| Database | PostgreSQL via Supabase | Managed, includes auth + storage |
| Cache | Redis via Upstash | Serverless, pay-per-request |
| AI / Chat | Claude claude-sonnet-4-20250514 | Via Anthropic API |
| Product Search | Elimapi | Official Taobao/1688/PDD partner API |
| Payments | BOG Pay | Bank of Georgia — GEL native |
| Email | Resend | Transactional emails |
| Hosting | Vercel | Frontend + API routes |
| Auth | Supabase Auth | Email + Google OAuth |

### Why these choices (non-negotiable)

**BOG Pay, not Stripe.** Stripe does not support GEL natively. BOG Pay processes GEL at 2.2% with no currency conversion, no cross-border fees, and is the standard processor for Georgian e-commerce. Do not substitute Stripe.

**Elimapi, not scraping.** Elimapi is an officially authorised Taobao/1688/Pinduoduo API partner. It returns product data in 200–500ms with 99.99% SLA. Scraping is fragile and violates marketplace ToS. Team 1 plan at $40/month.

**Supabase.** Provides managed Postgres + auth + storage in one. Use Supabase Auth for all authentication — do not build a custom auth system.

**Upstash Redis.** Serverless, pay-per-request. Used for search result caching (6h TTL) and daily search count limits per user.

---

## 3. Architecture

### High-level data flow — search request

```
User sends message (text or photo)
  ↓
Check Redis: search_count:{user_id}:{YYYY-MM-DD}
  → If at daily limit: inject soft prompt in chat (DO NOT block), stop
  → Increment counter
  ↓
Check Redis cache: hash(query + platform)
  → If hit: return cached results immediately
  ↓
Claude API: translate query to Chinese search terms
  → Input: user's natural language query
  → Output: JSON array of 2-3 Chinese search strings
  ↓
Elimapi API: POST item_search with Chinese terms
  → Returns raw product list in ~200–500ms
  ↓
Claude API: filter, rank, translate results
  → Input: original query + raw Elimapi JSON
  → Output: top 5 products with English titles, relevance scores, branded flag
  ↓
Pricing engine: calculate GEL price for each product
  → item_cost_gel = (price_cny + cn_shipping) / fx_rate * 1.05
  → commission_gel = item_cost_gel * 0.10
  → total_gel = item_cost_gel + commission_gel
  ↓
Store in Redis with 6h TTL
  ↓
Return product cards to chat UI
```

### Directory structure

```
commercat/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── chat/page.tsx               ← main app (authenticated only)
│   ├── orders/page.tsx
│   ├── settings/page.tsx
│   ├── admin/page.tsx              ← role-gated
│   └── layout.tsx
├── app/api/
│   ├── chat/route.ts               ← streaming Claude endpoint
│   ├── search/route.ts             ← Elimapi keyword search
│   ├── search/image/route.ts       ← Elimapi image search
│   ├── fx-rate/route.ts            ← CNY/GEL rate, cached 15min
│   ├── orders/route.ts             ← GET list, POST create
│   ├── orders/[id]/route.ts        ← GET single order
│   ├── orders/[id]/status/route.ts ← admin: update status
│   └── webhooks/bogpay/route.ts    ← payment confirmation
├── components/
│   ├── chat/
│   │   ├── ChatWindow.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ProductCardRow.tsx
│   │   ├── TrackingCard.tsx
│   │   └── SearchLimitPrompt.tsx
│   ├── basket/
│   │   └── BasketPanel.tsx
│   └── admin/
│       └── OrderTable.tsx
├── lib/
│   ├── elimapi.ts
│   ├── claude.ts
│   ├── pricing.ts
│   ├── redis.ts
│   ├── supabase.ts
│   └── bogpay.ts
└── types/
    └── index.ts
```

---

## 4. Database Schema

All tables in Supabase PostgreSQL. Run these exactly as written.

### 4.1 users

```sql
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT UNIQUE NOT NULL,
  full_name             TEXT,
  phone                 TEXT,

  -- Freight forwarder config
  preferred_forwarder   TEXT CHECK (preferred_forwarder IN ('mygeo', 'express_georgia', 'custom')),
  forwarder_address     TEXT,  -- full China warehouse address for this user's cabinet

  -- Size profile (used by Claude for sizing recommendations)
  size_profile          JSONB DEFAULT '{}',  -- e.g. { "clothing": "M", "shoes": "39" }

  -- Subscription
  subscription_tier     TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro', 'elite')),
  subscription_expires  TIMESTAMPTZ,

  -- Wallet (cashback credits — NOT withdrawable cash)
  wallet_balance_gel    NUMERIC(10,2) DEFAULT 0.00,

  -- Trial tracking
  trial_claimed         BOOLEAN DEFAULT FALSE,
  trial_claimed_at      TIMESTAMPTZ,

  -- Role
  is_admin              BOOLEAN DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 orders

```sql
CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  status                TEXT DEFAULT 'pending_payment' CHECK (status IN (
                          'pending_payment', 'paid', 'purchasing', 'purchased', 'shipped', 'at_warehouse', 'cancelled', 'refunded'
                        )),

  -- CRITICAL: Store item cost and commission separately for VAT reporting
  -- item_cost_gel = pass-through client funds (not Commercat revenue)
  -- commission_gel = Commercat's taxable revenue (10% service fee + 5% FX margin applied to item cost)
  item_cost_gel         NUMERIC(10,2) NOT NULL,   -- what user paid for item + FX buffer
  commission_gel        NUMERIC(10,2) NOT NULL,   -- Commercat's fee (VAT applies to this only)
  total_gel             NUMERIC(10,2) NOT NULL,   -- item_cost_gel + commission_gel

  fx_rate_used          NUMERIC(8,4) NOT NULL,    -- CNY/GEL rate at time of order

  -- Payment
  bog_payment_id        TEXT,
  bog_payment_status    TEXT,

  -- Fulfilment (filled by ops team)
  taobao_order_id       TEXT,       -- the order number on Taobao, purchased IN USER'S NAME
  tracking_number       TEXT,
  forwarder_address     TEXT NOT NULL,  -- user's personal cabinet address at forwarder
  notes                 TEXT,           -- internal ops notes

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 order_items

```sql
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Product identity
  product_id      TEXT NOT NULL,   -- Taobao/1688 item ID
  platform        TEXT NOT NULL CHECK (platform IN ('taobao', '1688', 'tmall', 'pinduoduo')),

  -- Snapshot at time of order (never update these)
  title_en        TEXT NOT NULL,
  title_cn        TEXT,
  image_url       TEXT,
  product_url     TEXT NOT NULL,   -- direct link to product page for ops team to purchase

  -- Pricing snapshot
  price_cny       NUMERIC(10,2) NOT NULL,
  price_gel       NUMERIC(10,2) NOT NULL,

  quantity        INTEGER DEFAULT 1,
  variant         JSONB DEFAULT '{}',   -- e.g. { "size": "M", "color": "beige" }

  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 conversations

```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages    JSONB DEFAULT '[]',   -- full message history array
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.5 search_cache

```sql
CREATE TABLE search_cache (
  query_hash      TEXT PRIMARY KEY,   -- SHA-256 of (query + platform)
  query_original  TEXT NOT NULL,
  platform        TEXT,
  results         JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL   -- created_at + 6 hours
);

-- Clean up expired entries periodically
CREATE INDEX idx_search_cache_expires ON search_cache(expires_at);
```

### 4.6 forwarders

```sql
CREATE TABLE forwarders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,        -- e.g. 'MyGeo', 'Express Georgia'
  cn_address          TEXT NOT NULL,        -- warehouse address template
  referral_fee_usd    NUMERIC(6,2),         -- $1.00 per order (from month 13)
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.7 Row Level Security

```sql
-- Users can only see their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own" ON users FOR ALL USING (auth.uid() = id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_own" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_own" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.user_id = auth.uid()));

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_own" ON conversations FOR ALL USING (auth.uid() = user_id);

-- Admins bypass RLS via service role key (used only in API routes, never frontend)
```

---

## 5. Pricing Engine

### CRITICAL: Two-line display is mandatory

The checkout display MUST show item cost and service fee as two separate line items. This is legally required for the agency VAT model. Never show a single blended price.

```
Item cost:      61.75 GEL   ← (price_cny + cn_shipping) / fx_rate * 1.05
Service fee:     6.18 GEL   ← item_cost_gel * 0.10
─────────────────────────
Total:          67.93 GEL
```

### Formula

```typescript
// lib/pricing.ts

export function calculatePrice(
  priceCny: number,
  cnShippingCny: number,
  fxRateGelPerCny: number
): {
  itemCostGel: number;
  commissionGel: number;
  totalGel: number;
} {
  // Step 1: Convert to GEL with 5% FX buffer
  // The 5% covers CNY/GEL fluctuation between search and purchase
  const itemCostGel = ((priceCny + cnShippingCny) / fxRateGelPerCny) * 1.05;

  // Step 2: Calculate 10% service fee on the GEL-converted amount
  const commissionGel = itemCostGel * 0.10;

  // Step 3: Total
  const totalGel = itemCostGel + commissionGel;

  return {
    itemCostGel: Math.round(itemCostGel * 100) / 100,
    commissionGel: Math.round(commissionGel * 100) / 100,
    totalGel: Math.round(totalGel * 100) / 100,
  };
}

// Simplified: total ≈ base_cost_gel * 1.155
```

### FX Rate

- Source: exchangerate-api.com (or fixer.io as backup)
- Refresh: every 15 minutes
- Storage: Redis key `fx:cny_gel` with 15-minute TTL
- The rate used for an order is locked at the moment the order is created and stored in `orders.fx_rate_used`

### Price lock policy

- Price shown to user is locked for 30 minutes after search result
- If item price changes by ≤10 GEL before purchase: absorb the difference silently
- If item price changes by >10 GEL: notify user and offer choice to approve or refund

---

## 6. API Routes

### 6.1 POST /api/chat

Main chat endpoint. Streaming response.

**Request body:**
```typescript
{
  message: string;           // user's text message
  image_base64?: string;     // optional base64 image for photo search
  conversation_id?: string;  // UUID — if null, create new conversation
}
```

**What it does:**
1. Load conversation history from Supabase (or create new)
2. Check if message contains search intent (via Claude)
3. If search intent: check Redis search count for today; if at limit, inject soft prompt instead of searching
4. If search proceeds: translate → search Elimapi → filter via Claude → calculate prices → cache
5. Stream Claude's response including any product card data
6. Save updated conversation to Supabase

**Response:** Server-sent events (SSE) streaming text + JSON product cards

**Product card format embedded in stream:**
```json
{
  "type": "product_cards",
  "products": [
    {
      "id": "string",
      "platform": "taobao",
      "title_en": "string",
      "title_cn": "string",
      "image_url": "string",
      "product_url": "string",
      "price_cny": 45.00,
      "price_gel": 61.75,
      "commission_gel": 6.18,
      "total_gel": 67.93,
      "skus": [...],
      "branded": false,
      "relevance_score": 0.92
    }
  ]
}
```

### 6.2 POST /api/search

Direct search (non-streaming). Used by the chat route internally.

**Request:**
```typescript
{
  query: string;
  platforms: ('taobao' | '1688' | 'tmall' | 'pinduoduo')[];
  image_url?: string;
}
```

**Response:**
```typescript
{
  products: Product[];
  cached: boolean;
  query_cn: string[];   // Chinese terms used
}
```

### 6.3 GET /api/fx-rate

Returns current CNY/GEL exchange rate. Cached 15 minutes in Redis.

**Response:**
```typescript
{
  rate: number;        // GEL per 1 CNY, e.g. 0.3814
  updated_at: string;  // ISO timestamp
}
```

### 6.4 POST /api/orders

Create a new order. Requires authenticated user.

**Request:**
```typescript
{
  items: {
    product_id: string;
    platform: string;
    title_en: string;
    title_cn: string;
    image_url: string;
    product_url: string;
    price_cny: number;
    price_gel: number;
    quantity: number;
    variant: { size?: string; color?: string; [key: string]: string };
  }[];
  forwarder_address: string;   // user's personal cabinet address
}
```

**What it does:**
1. Fetch current FX rate
2. Calculate item_cost_gel, commission_gel, total_gel for all items
3. Create order record in Supabase with status `pending_payment`
4. Initiate BOG Pay payment
5. Return BOG Pay redirect URL

**Response:**
```typescript
{
  order_id: string;
  payment_url: string;   // redirect user here to complete payment
  total_gel: number;
}
```

### 6.5 GET /api/orders

List orders for authenticated user. Ordered by created_at DESC.

### 6.6 GET /api/orders/:id

Single order with all items and status history.

### 6.7 POST /api/orders/:id/status

Admin-only route. Update order status.

**Request:**
```typescript
{
  status: 'purchasing' | 'purchased' | 'shipped' | 'at_warehouse' | 'cancelled' | 'refunded';
  tracking_number?: string;
  taobao_order_id?: string;
  notes?: string;
}
```

**Auth:** Verify `users.is_admin = true` using service role key. Reject 403 if not admin.

### 6.8 POST /api/webhooks/bogpay

BOG Pay payment confirmation webhook.

**What it does:**
1. Verify BOG Pay signature using `BOG_PAY_SECRET_KEY`
2. Extract order_id from payment metadata
3. Update order status to `paid`
4. Send confirmation message in chat: "Payment confirmed! Order #COM-XXXX received. We'll purchase your item in China within 24 hours."
5. Send email confirmation via Resend
6. Send admin notification (email to ADMIN_EMAILS)

**CRITICAL:** Always verify the webhook signature before processing. Reject unsigned requests with 401.

---

## 7. Claude AI Integration

### 7.1 System prompt

```
You are a personal shopping assistant for Commercat, a platform that sources products from Chinese marketplaces for global shoppers. You help users find products from Taobao, Tmall, 1688, and Pinduoduo.

Your job: understand what the user wants → search for it → present results clearly → help them choose size/colour → guide to checkout. Always show prices in the user's local currency. Always be warm, direct, and concise.

Respond in the user's language. If they write in English, reply in English. If they write in another language, reply in that language.

Commercat acts as the user's purchasing agent — every order is placed in their name, to their freight forwarder's personal cabinet address. Mention this naturally when users ask how it works.

If a user uploads a photo, describe what you see and search for visually similar products. If an item appears to be a branded/luxury dupe, add a light disclaimer: "This may be a similar-style item — authenticity is not guaranteed." Never guarantee authenticity.

When presenting search results, always show the two-line price breakdown:
- Item cost: X GEL (covers the product and our FX buffer)
- Service fee: Y GEL (Commercat's fee)
- Total: Z GEL

Never mention competitors, never make up products, never fabricate prices. Only show what Elimapi returns.
```

### 7.2 Search translation prompt

```
User query: "{{query}}"
{{#if size_profile}}User's size profile: {{size_profile}}{{/if}}

Translate this into 2-3 Chinese search terms that Chinese sellers would use on Taobao and 1688. Return ONLY a valid JSON array of strings, nothing else.

Example output: ["亚麻阔腿裤女", "棉麻宽松裤子", "阔腿裤显瘦"]
```

### 7.3 Result filtering prompt

```
The user searched for: "{{original_query}}"

Here are raw results from Chinese marketplaces:
{{raw_results_json}}

Return the top 5 most relevant products as a valid JSON array. For each product include:
- id (from raw results)
- title_en (translate the Chinese title to natural English)
- title_cn (original)
- image_url
- product_url
- price_cny
- platform
- skus (size/colour options)
- branded (boolean — true if appears to be a luxury brand dupe)
- relevance_score (0.0 to 1.0)

Remove products that are clearly irrelevant to the query.
Sort by relevance_score descending.
Return ONLY valid JSON, no explanation text.
```

### 7.4 Claude API call pattern

```typescript
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function streamChat(
  messages: Anthropic.MessageParam[],
  systemPrompt: string
): Promise<ReadableStream> {
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  return stream.toReadableStream();
}

export async function translateQuery(query: string): Promise<string[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Translate this shopping query to 2-3 Chinese search terms for Taobao. Return only a JSON array of strings.\n\nQuery: "${query}"`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

export async function filterResults(query: string, rawResults: object[]): Promise<object[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Original query: "${query}"\n\nRaw results:\n${JSON.stringify(rawResults)}\n\nReturn top 5 most relevant as JSON array with: id, title_en, title_cn, image_url, product_url, price_cny, platform, skus, branded, relevance_score. Return ONLY valid JSON.`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
```

---

## 8. Payment Flow — BOG Pay

### 8.1 Overview

BOG Pay (Bank of Georgia) processes payments natively in GEL. Users are redirected to BOG Pay's hosted payment page, complete payment there, and are redirected back. BOG Pay then sends a webhook to confirm.

**Rate:** 2.2% initial, negotiable to 1.5–1.8% at volume.

### 8.2 Payment initiation

```typescript
// lib/bogpay.ts

export async function createPayment(params: {
  orderId: string;
  amountGel: number;
  description: string;
  successUrl: string;
  failUrl: string;
}): Promise<{ paymentUrl: string; paymentId: string }> {
  const response = await fetch('https://api.bog.ge/payments/v1/payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BOG_PAY_API_KEY}`,
    },
    body: JSON.stringify({
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/bogpay`,
      purchase_units: [{
        currency: 'GEL',
        total_amount: params.amountGel,
        basket: [{ quantity: 1, unit_price: params.amountGel, product_id: params.orderId }],
      }],
      redirect_urls: {
        success: params.successUrl,
        fail: params.failUrl,
      },
    }),
  });

  const data = await response.json();
  return {
    paymentUrl: data.redirect_url,
    paymentId: data.id,
  };
}
```

### 8.3 Webhook handler

```typescript
// app/api/webhooks/bogpay/route.ts

export async function POST(req: Request) {
  const signature = req.headers.get('x-bog-signature');
  const body = await req.text();

  // 1. Verify signature
  if (!verifyBogSignature(body, signature, process.env.BOG_PAY_SECRET_KEY!)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.event === 'payment.success') {
    const orderId = event.order.purchase_units[0].basket[0].product_id;

    // 2. Update order status
    await supabase.from('orders').update({
      status: 'paid',
      bog_payment_id: event.payment_id,
      bog_payment_status: 'success',
    }).eq('id', orderId);

    // 3. Send chat confirmation (append to conversation)
    await appendChatMessage(orderId, {
      role: 'assistant',
      content: `Payment confirmed! ✓ Order #COM-${orderId.slice(-6).toUpperCase()} received. We'll purchase your item in China within 24 hours and update you here.`
    });

    // 4. Email confirmation via Resend
    await sendOrderConfirmationEmail(orderId);

    // 5. Admin notification
    await notifyAdmins(orderId);
  }

  return new Response('OK', { status: 200 });
}
```

---

## 9. Search Limits & Subscription Tiers

### 9.1 Tier definitions

| Tier | Price | Searches/day | Active orders | Cashback | Price drop alerts | Priority |
|------|-------|-------------|--------------|---------|-------------------|---------|
| free | $0 | 15 | 1 | — | — | — |
| starter | $2/mo | 20 | 1 | 1% wallet credit | — | — |
| pro | $5/mo | 50 | unlimited | 1.2% wallet credit | ✓ | — |
| elite | $10/mo | 100 | unlimited | 1.5% wallet credit | ✓ | ✓ |

**Cashback is wallet credit only** — it accrues in `users.wallet_balance_gel` and can be applied to future orders. It is NOT withdrawable as cash.

**Year 1 (months 1–12):** All tiers are free. Do not charge for subscriptions during year 1. The tier system exists in the database but subscription_tier for all users stays `'free'` and they get free Pro features for the first 12 months.

### 9.2 Search limit implementation

```typescript
// Redis key pattern: search_count:{user_id}:{YYYY-MM-DD}
// Timezone: UTC+4 (Georgian time) for midnight reset

async function checkAndIncrementSearchCount(userId: string, tier: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
  showUpgradePrompt: boolean;
}> {
  const limits = { free: 15, starter: 20, pro: 50, elite: 100 };
  const limit = limits[tier as keyof typeof limits] ?? 15;

  // Get today's date in UTC+4
  const now = new Date();
  const tbilisiDate = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const dateKey = tbilisiDate.toISOString().split('T')[0];

  const redisKey = `search_count:${userId}:${dateKey}`;
  const current = await redis.get(redisKey);
  const count = current ? parseInt(current) : 0;

  if (count >= limit) {
    return { allowed: false, count, limit, showUpgradePrompt: true };
  }

  // Increment with TTL until midnight UTC+4
  const secondsUntilMidnight = getSecondsUntilMidnightUTC4();
  await redis.setex(redisKey, secondsUntilMidnight, (count + 1).toString());

  return { allowed: true, count: count + 1, limit, showUpgradePrompt: false };
}
```

### 9.3 Soft limit prompt (in-chat, not a hard block)

When the daily limit is hit, inject this as a chat message — do NOT block the conversation or show a modal:

```
You've used your {{limit}} free searches for today. Your searches reset at midnight.

Want more? Pro gives you 50 searches/day, 1.2% cashback, and price drop alerts — $5/month after a free 30-day trial.

[Start free trial →]  [Maybe later]
```

**The "Start free trial" button** triggers the Pro trial flow:
- Check `users.trial_claimed` — if already claimed, do not offer again
- Set up subscription with 30-day free trial (billing starts day 31)
- Set `trial_claimed = true`, `trial_claimed_at = NOW()`
- Upgrade `subscription_tier` to `'pro'` immediately
- Stripe handles the billing side; BOG Pay is for orders only

---

## 10. Frontend Components

### 10.1 ChatWindow

The main UI. Renders conversation as message bubbles.

```typescript
// components/chat/ChatWindow.tsx

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: Product[];         // triggers ProductCardRow render
  trackingInfo?: OrderStatus;   // triggers TrackingCard render
  isSearchLimit?: boolean;      // triggers SearchLimitPrompt render
  timestamp: Date;
}
```

**Styling rules:**
- User messages: right-aligned, `background: #3C3C3B`, white text, `border-radius: 12px 12px 0 12px`
- Assistant messages: left-aligned, `background: #FFFFFF`, border, `border-radius: 12px 12px 12px 0`
- Streaming: characters appear as they arrive — no animation needed, the streaming is the animation
- New messages fade in + slide up 6px, 150ms ease-out

### 10.2 ProductCard

Displayed horizontally scrollable inside assistant messages.

**Must display:**
- Product image (from Elimapi imageUrl)
- Platform badge (TAOBAO / 1688 / TMALL / PDD)
- English product name (translated by Claude)
- Price — TWO LINES, mandatory:
  ```
  Item cost: 61.75 GEL
  Service fee: 6.18 GEL
  Total: 67.93 GEL
  ```
- Size selector buttons (from product SKUs)
- Colour selector dots (from product SKUs)
- "Add to basket" button
- Branded disclaimer badge if `branded === true`: "Similar style — not guaranteed authentic"

**Width:** 180px fixed. Scroll horizontally when multiple cards.

### 10.3 ChatInput

```typescript
// components/chat/ChatInput.tsx
// - Text input, Enter to send
// - Photo upload button: opens file picker → convert to base64 → send with message
// - Quick chips (shown on empty state): "Find by photo", "Track my order", "Sizing help", "Find a dupe"
// - Disabled state while streaming
```

### 10.4 BasketPanel

Slide-in from right on desktop, bottom sheet on mobile. 300ms ease-in-out.

**Must show:**
- Item list: thumbnail, name, variant, price breakdown
- Forwarder selector dropdown (from `forwarders` table, only `active = true`)
- Order summary:
  ```
  Item cost subtotal:   XXX.XX GEL
  Service fee:          XXX.XX GEL
  ─────────────────────────────────
  Total:                XXX.XX GEL
  ```
- Agency disclosure (required): *"Commercat purchases this order in your name, to your freight forwarder's personal cabinet."*
- Checkout button → initiates order creation → redirects to BOG Pay URL
- Background dims to `rgba(0,0,0,0.3)` when panel open

### 10.5 TrackingCard

Rendered inside chat when user asks "where is my order?", "track order", etc.

```typescript
// Shows: order number, product image, current status, timeline
// Status timeline: Paid → Purchased → Shipped → At warehouse
// Claude detects tracking intent and calls /api/orders/:id, then injects this card
```

### 10.6 SearchLimitPrompt

A special chat bubble (not a modal) injected once per session when daily limit is hit.

```typescript
// One-time per session flag: searchLimitPromptShown in component state
// Shows tier options inline with upgrade buttons
// "Start free trial" → triggers trial flow without leaving chat
```

---

## 11. Admin Panel

Route: `/admin` — requires `users.is_admin = true`. Verify server-side on every request using the service role key.

### 11.1 Order table

```typescript
// Columns:
// - Order #COM-XXXXXX
// - Created at
// - User name + email
// - Product(s) — truncated title, quantity
// - Total GEL
// - Status badge (colour-coded)
// - Product URL(s) — direct link to Taobao/1688 for purchasing
// - Status update dropdown + Save button
// - Tracking number input field
// - Internal notes field

// Filter tabs: All | Paid | Purchasing | Purchased | Shipped | At warehouse
// Default sort: created_at DESC
// Batch view: show all orders from last 24h with status 'paid' — "Morning purchasing queue"
```

### 11.2 Status update flow

When ops team clicks "Save" after updating status:
1. POST `/api/orders/:id/status` with new status
2. System sends in-chat message to user:
   - `purchased`: "Your item has been purchased in China. It's on its way to your forwarder's warehouse."
   - `shipped`: "Your item is on its way to the warehouse. Tracking: {{tracking_number}}"
   - `at_warehouse`: "Your item has arrived at your forwarder's warehouse. It's ready for you to arrange shipping to your address."

---

## 12. Elimapi Integration

### 12.1 Authentication

All requests require: `Authorization: Bearer {ELIMAPI_KEY}` in headers. ELIMAPI_KEY is a server-side env var only. Never expose to frontend.

### 12.2 Key endpoints

**Keyword search:**
```
POST https://api.elim.asia/v2/item_search
{
  "keyword": "亚麻阔腿裤女",
  "platform": "taobao",
  "page": 1,
  "limit": 20
}
```

**Image search (dupe finder):**
```
POST https://api.elim.asia/v2/item_search_img
{
  "image_url": "https://...",
  "platform": "taobao"
}
```

**Product detail:**
```
GET https://api.elim.asia/v2/item_get?item_id=123456789&platform=taobao
```

### 12.3 Response normalisation

Elimapi returns different field names per platform. Always normalise before processing:

```typescript
// lib/elimapi.ts

interface NormalisedProduct {
  id: string;
  title_cn: string;
  price_cny: number;
  cn_shipping_cny: number;
  image_url: string;
  product_url: string;
  shop_name: string;
  platform: 'taobao' | '1688' | 'tmall' | 'pinduoduo';
  sales_count: number;
  skus: { size?: string; color?: string; price?: number }[];
}

export function normalise(raw: any, platform: string): NormalisedProduct {
  return {
    id: raw.item_id ?? raw.id ?? raw.num_iid,
    title_cn: raw.title,
    price_cny: parseFloat(raw.price ?? raw.min_price ?? raw.sale_price ?? '0'),
    cn_shipping_cny: parseFloat(raw.post_fee ?? raw.shipping ?? '0'),
    image_url: raw.image_url ?? raw.pic_url ?? raw.main_imgs?.[0] ?? raw.images?.[0],
    product_url: buildProductUrl(platform, raw.item_id ?? raw.id),
    shop_name: raw.shop_name ?? raw.seller_nick ?? raw.nick,
    platform: platform as any,
    sales_count: parseInt(raw.comment_count ?? raw.sales ?? raw.volume ?? '0'),
    skus: raw.skus ?? [],
  };
}

function buildProductUrl(platform: string, itemId: string): string {
  const urls: Record<string, string> = {
    taobao: `https://item.taobao.com/item.htm?id=${itemId}`,
    tmall: `https://detail.tmall.com/item.htm?id=${itemId}`,
    '1688': `https://detail.1688.com/offer/${itemId}.html`,
    pinduoduo: `https://mobile.yangkeduo.com/goods.html?goods_id=${itemId}`,
  };
  return urls[platform] ?? '#';
}
```

### 12.4 Redis caching

```typescript
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

async function getCachedResults(query: string, platform: string): Promise<NormalisedProduct[] | null> {
  const hash = createHash('sha256').update(`${query}:${platform}`).digest('hex');
  const cached = await redis.get(`search:${hash}`);
  return cached ? JSON.parse(cached) : null;
}

async function setCachedResults(query: string, platform: string, results: NormalisedProduct[]): Promise<void> {
  const hash = createHash('sha256').update(`${query}:${platform}`).digest('hex');
  await redis.setex(`search:${hash}`, CACHE_TTL_SECONDS, JSON.stringify(results));
}
```

---

## 13. Environment Variables

All of these must be set in Vercel before deploying. Never commit any of these to git.

```bash
# Anthropic
ANTHROPIC_API_KEY=                    # Claude API key — from console.anthropic.com

# Elimapi
ELIMAPI_KEY=                          # From elim.asia dashboard — Team 1 plan

# BOG Pay
BOG_PAY_API_KEY=                      # BOG Pay merchant API key
BOG_PAY_SECRET_KEY=                   # BOG Pay webhook signing secret

# Supabase
DATABASE_URL=                         # Supabase Postgres connection string (pooled)
SUPABASE_URL=                         # Supabase project URL
SUPABASE_ANON_KEY=                    # Supabase anon key (safe for frontend)
SUPABASE_SERVICE_KEY=                 # Supabase service role key (SERVER ONLY — never expose)

# Redis
REDIS_URL=                            # Upstash Redis connection URL

# FX Rate
FX_API_KEY=                           # exchangerate-api.com API key

# Email
RESEND_API_KEY=                       # Resend API key for transactional emails
FROM_EMAIL=orders@commercat.ge        # Sender email address

# App
NEXT_PUBLIC_APP_URL=https://commercat.ge   # Public app URL
ADMIN_EMAILS=                              # Comma-separated admin email addresses

# Optional
CLOUDINARY_URL=                       # If using Cloudinary for image upload proxy
```

---

## 14. Build Order

**Build in this exact sequence.** Each phase produces a working, testable system before the next begins. Do not skip phases.

### Phase 1 — Foundation (Week 1)

1. `npx create-next-app@latest commercat --typescript --tailwind --app`
2. Install dependencies:
   ```bash
   npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk @upstash/redis
   ```
3. Configure Supabase project → create all tables from Section 4 schema
4. Enable Supabase Auth → configure email + Google OAuth
5. Set up Upstash Redis → add REDIS_URL to `.env.local`
6. Build `/api/fx-rate` → fetch CNY/GEL from exchangerate-api.com → cache 15min in Redis → test with curl
7. Build `/api/search` → call Elimapi with a hardcoded Chinese query → normalise response → return JSON → test with Postman
8. Build `/api/search/image` → pass image_url to Elimapi image search → return normalised products
9. ✅ **Checkpoint:** `/api/search?query=亚麻阔腿裤` returns real Taobao products with GEL prices

### Phase 2 — Chat Core (Week 2)

10. Build `ChatWindow` component with static mock messages — no API yet
11. Build `ProductCard` component with mock data — verify TWO-LINE price display renders correctly
12. Build `ProductCardRow` — horizontal scroll of 3–5 cards inside a chat bubble
13. Build `/api/chat` → connect to Anthropic API → streaming response → test with static messages
14. Wire chat → search: Claude detects search intent → calls `/api/search` → returns product cards embedded in stream
15. Build `ChatInput` with photo upload → base64 → sends with message → triggers image search
16. Implement Redis search count per user per day (`search_count:{uid}:{date}`)
17. Build `SearchLimitPrompt` — inject as chat message when limit hit, not a hard block
18. ✅ **Checkpoint:** Full search flow works end-to-end — type query → see product cards → photo upload works → search limit prompt appears correctly

### Phase 3 — Commerce (Week 3)

19. Build `BasketPanel` — add/remove items, variant selection, two-line price breakdown, forwarder selector
20. Build `/api/orders` POST → create order → initiate BOG Pay → return redirect URL
21. Build BOG Pay redirect flow → user completes payment → returns to app
22. Build `/api/webhooks/bogpay` → verify signature → update order to `paid` → inject chat message → send email
23. Build `/api/orders` GET → list user's orders
24. Build email confirmation via Resend — send on payment success
25. ✅ **Checkpoint:** Full payment flow — add to basket → checkout → BOG Pay redirect → payment confirmed → chat message appears

### Phase 4 — Operations (Week 4)

26. Build `/orders` page — order history with status badges and timeline
27. Build `TrackingCard` component — rendered in chat when Claude detects "where is my order" intent
28. Wire order tracking intent in Claude system prompt — when user asks about order, fetch status from `/api/orders/:id` and inject TrackingCard
29. Build `/admin` page — order table with status tabs, status update dropdown, tracking number input
30. Build `/api/orders/:id/status` — admin-only route → validate is_admin → update status → inject chat message to user
31. Polish mobile layout — test on iOS Safari and Android Chrome at 375px, 390px, 414px viewport widths
32. Set up Vercel deployment → configure all env vars → set BOG Pay webhook URL to `https://commercat.ge/api/webhooks/bogpay`
33. ✅ **End-to-end test:** Search → add to basket → pay → ops marks purchased via admin → user sees "Your item has been purchased" in chat

---

## 15. Business Rules & Constraints

These are non-negotiable constraints that must be enforced in code, not just documented.

### 15.1 Agency model enforcement

- Every order record must store `forwarder_address` — the user's personal cabinet address
- The `taobao_order_id` field stores the order placed **in the user's name** on Taobao
- Never refer to Commercat as the "buyer" in any user-facing text — use "we purchased this for you" or "your order on Taobao"
- The two-line price display (item_cost_gel + commission_gel shown separately) must appear on every ProductCard, BasketPanel summary, order confirmation, and email receipt

### 15.2 Search limit — soft only, never hard

The daily search limit is enforced as a gentle in-chat prompt. The user can still use the chat for non-search purposes (tracking orders, asking questions, etc.) after the limit is hit. Do not lock the chat, do not show a modal, do not block any route. The limit applies only to Elimapi searches, tracked via Redis.

### 15.3 Cashback is wallet credit only

`users.wallet_balance_gel` accrues on every paid order based on subscription tier rate. It can be applied to future orders as a discount. It cannot be withdrawn as cash. When applying cashback, deduct from `wallet_balance_gel` and reduce `total_gel` by the same amount. Show clearly in BasketPanel: "Apply wallet balance: -X.XX GEL"

### 15.4 Admin security

- The `/admin` route and `/api/orders/:id/status` route must verify `users.is_admin = true` on every request
- Use the Supabase **service role key** (not the anon key) to bypass RLS for admin queries
- Never expose the service role key to the frontend — all admin API calls are server-side only

### 15.5 Webhook security

Always verify BOG Pay webhook signatures. Never process a payment confirmation without first verifying the signature. Respond with 401 if signature verification fails.

### 15.6 FX rate precision

- Store the FX rate used for each order in `orders.fx_rate_used`
- Never recalculate prices after an order is created — always use the locked rate
- Display prices with exactly 2 decimal places throughout

### 15.7 Price lock

The price shown in search results is valid for 30 minutes. Store the `price_locked_at` timestamp in the basket item state. If the user attempts checkout after 30 minutes, refresh the price before creating the order and show them the updated total.

### 15.8 Trial offer — one-time only

The free Pro trial offer (triggered when daily search limit is hit) is offered exactly once per account. Check `users.trial_claimed` before offering. If `trial_claimed = true`, do not offer the trial again — instead show a standard upgrade prompt. Set `trial_claimed = true` the moment the user clicks "Start free trial", not when the trial period ends.

---

## Appendix A — Commercat Brand Tokens

Use these exact values in Tailwind config / CSS variables:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        charcoal: '#3C3C3B',
        cream: '#F8F7F4',
        'gray-light': '#EEEDE9',
        'gray-mid': '#B4B2A9',
        'gray-dark': '#888780',
        accent: '#E8A020',
        'accent-light': '#FFF3DC',
        green: '#1D9E75',
        'green-dark': '#0F6E56',
        'green-light': '#E1F5EE',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
};
```

**Key visual rules:**
- Background: `#F8F7F4` (cream) for pages, `#FFFFFF` for cards
- Primary buttons: `#3C3C3B` background, white text
- Accent (upgrade/conversion CTAs only): `#E8A020`
- Prices always in `font-mono`
- No gradients, no drop shadows on cards (only subtle border)

---

## Appendix B — Elimapi Plan

- **Plan:** Team 1 ($40/month)
- **Includes:** 10,000 requests/month, image search, all 4 platforms
- **Sign up:** elim.asia dashboard
- **Expected latency:** 200–500ms per request (well within 2-second UX target)

---

## Appendix C — Key Third-Party Contacts

| Service | What for | Sign-up URL |
|---------|---------|-------------|
| Elimapi | Product search API | elim.asia |
| BOG Pay | GEL payment processing | developers.bog.ge |
| Supabase | Database + auth | supabase.com |
| Upstash | Redis cache | upstash.com |
| Anthropic | Claude AI | console.anthropic.com |
| Resend | Transactional email | resend.com |
| exchangerate-api.com | CNY/GEL live rate | exchangerate-api.com |
| Vercel | Hosting | vercel.com |

---

*Commercat Technical Specification v2.0 — Confidential. April 2026.*

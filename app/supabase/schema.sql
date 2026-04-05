-- Commercat Database Schema
-- Run against Supabase PostgreSQL

-- ── Users ──

CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT UNIQUE NOT NULL,
  full_name             TEXT,
  phone                 TEXT,

  -- Freight forwarder config
  preferred_forwarder   TEXT CHECK (preferred_forwarder IN ('mygeo', 'express_georgia', 'custom')),
  forwarder_address     TEXT,

  -- Size profile (used by Claude for sizing recommendations)
  size_profile          JSONB DEFAULT '{}',

  -- Subscription
  subscription_tier     TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro', 'elite')),
  subscription_expires  TIMESTAMPTZ,

  -- Wallet (cashback credits — NOT withdrawable cash)
  wallet_balance_gel    NUMERIC(10,2) DEFAULT 0.00,

  -- Trial tracking
  trial_claimed         BOOLEAN DEFAULT FALSE,
  trial_claimed_at      TIMESTAMPTZ,

  -- Currency preference (ISO 4217)
  preferred_currency    TEXT DEFAULT 'USD',

  -- Role
  is_admin              BOOLEAN DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Orders ──

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  status                TEXT DEFAULT 'pending_payment' CHECK (status IN (
                          'pending_payment', 'paid', 'purchasing', 'purchased',
                          'shipped', 'at_warehouse', 'cancelled', 'refunded'
                        )),

  -- Pricing: item cost and commission stored separately for VAT reporting
  -- item_cost_gel = pass-through client funds (not Commercat revenue)
  -- commission_gel = Commercat's taxable revenue
  item_cost_gel         NUMERIC(10,2) NOT NULL,
  commission_gel        NUMERIC(10,2) NOT NULL,
  total_gel             NUMERIC(10,2) NOT NULL,

  -- FX rates locked at order creation
  fx_rate_used          NUMERIC(8,4) NOT NULL,     -- CNY/GEL rate
  display_currency      TEXT NOT NULL DEFAULT 'USD', -- user's display currency at order time
  display_fx_rate       NUMERIC(8,4) NOT NULL,      -- CNY/display-currency rate at order time

  -- Payment
  bog_payment_id        TEXT,
  bog_payment_status    TEXT,

  -- Fulfilment
  taobao_order_id       TEXT,
  tracking_number       TEXT,
  forwarder_address     TEXT NOT NULL,
  notes                 TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Order Items ──

CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  product_id      TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('taobao', '1688', 'tmall', 'pinduoduo')),

  -- Snapshot at time of order (never update these)
  title_en        TEXT NOT NULL,
  title_cn        TEXT,
  image_url       TEXT,
  product_url     TEXT NOT NULL,

  price_cny       NUMERIC(10,2) NOT NULL,
  price_gel       NUMERIC(10,2) NOT NULL,

  quantity        INTEGER DEFAULT 1,
  variant         JSONB DEFAULT '{}',

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Conversations ──

CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Search Cache ──

CREATE TABLE search_cache (
  query_hash      TEXT PRIMARY KEY,
  query_original  TEXT NOT NULL,
  platform        TEXT,
  results         JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_search_cache_expires ON search_cache(expires_at);

-- ── Forwarders ──

CREATE TABLE forwarders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  cn_address          TEXT NOT NULL,
  referral_fee_usd    NUMERIC(6,2),
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ──

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

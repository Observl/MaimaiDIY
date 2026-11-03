-- Proposed PostgreSQL migration. Do not deploy without backend auth, secret management and RLS review.
CREATE TABLE IF NOT EXISTS commerce_users (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subject)
);
CREATE TABLE IF NOT EXISTS design_versions (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES commerce_users(id),
  design_schema_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  rights_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (rights_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS commerce_orders (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES commerce_users(id),
  source TEXT NOT NULL CHECK (source IN ('web', 'xiaohongshu')),
  external_order_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid_review','approved','producing','shipped','completed','cancelled','refunding','refunded')),
  total_fen INTEGER NOT NULL CHECK (total_fen >= 0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, idempotency_key),
  UNIQUE (source, external_order_id)
);
CREATE TABLE IF NOT EXISTS commerce_order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES commerce_orders(id),
  design_version_id UUID NOT NULL REFERENCES design_versions(id),
  product_type TEXT NOT NULL,
  variant TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_fen INTEGER NOT NULL CHECK (unit_price_fen >= 0),
  discount_fen INTEGER NOT NULL DEFAULT 0 CHECK (discount_fen >= 0),
  line_total_fen INTEGER NOT NULL CHECK (line_total_fen >= 0)
);
CREATE TABLE IF NOT EXISTS commerce_payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES commerce_orders(id),
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','verified','failed','refunded')),
  verified_at TIMESTAMPTZ,
  UNIQUE (provider, provider_transaction_id)
);
CREATE TABLE IF NOT EXISTS production_jobs (
  id UUID PRIMARY KEY,
  order_item_id UUID NOT NULL UNIQUE REFERENCES commerce_order_items(id),
  status TEXT NOT NULL DEFAULT 'rights_review'
    CHECK (status IN ('rights_review','proof_review','ready','submitted','accepted','producing','shipped','rejected')),
  supplier_reference TEXT UNIQUE,
  print_bundle_key TEXT,
  tracking_carrier TEXT,
  tracking_number TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Recipient address/contact data belongs in a separately encrypted access-controlled service,
-- not in design JSON, browser localStorage, or public GitHub Pages.

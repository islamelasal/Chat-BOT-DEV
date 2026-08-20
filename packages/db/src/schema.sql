-- ============================================================
-- Chat Bot Dev — Schema (v1)
-- يُشغَّل كما هو على SQLite (تطوير/ديمو)، ويُحوَّل آلياً لـ PostgreSQL (إنتاج)
-- التواريخ كلها epoch ms INTEGER — قابلة للنقل بين المحركين.
-- ============================================================

CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',           -- super_admin | operator | support
  totp_secret TEXT,                                 -- مشفر
  refresh_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  brand_json TEXT NOT NULL DEFAULT '{}',
  theme_json TEXT NOT NULL DEFAULT '{}',
  cs_cart_json TEXT NOT NULL DEFAULT '',   -- إعداد تكامل CS-Cart (storeUrl/apiEmail/apiKey مشفر)
  monthly_limit INTEGER NOT NULL DEFAULT 5000,
  daily_limit INTEGER NOT NULL DEFAULT 300,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  client_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  PRIMARY KEY (client_id, domain)
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  max_reply_len INTEGER NOT NULL DEFAULT 1200,
  forbidden_json TEXT NOT NULL DEFAULT '[]',
  routing_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  welcome_msg TEXT NOT NULL DEFAULT '',
  suggestions_json TEXT NOT NULL DEFAULT '[]',
  fallback_msg TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                               -- openai-compatible | gemini-native | mock
  base_url TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'free',
  limits_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  context_window INTEGER NOT NULL DEFAULT 128000,
  cost_in REAL NOT NULL DEFAULT 0,
  cost_out REAL NOT NULL DEFAULT 0,
  free INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE (provider_id, name)
);

CREATE TABLE IF NOT EXISTS heartbeat_logs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  page_path TEXT,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,                                -- YYYY-MM-DD
  client_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  msg_count INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, client_id, bot_id, provider_id, model)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bots_client ON bots (client_id);
CREATE INDEX IF NOT EXISTS idx_chunks_bot ON knowledge_chunks (bot_id);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models (provider_id);
CREATE INDEX IF NOT EXISTS idx_hb_provider ON heartbeat_logs (provider_id, at);
CREATE INDEX IF NOT EXISTS idx_conv_client ON conversations (client_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_client ON usage_events (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  conversation_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  page_path TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_client ON leads (client_id, created_at);

-- ─────────────────── كتالوج منتجات العملاء (الفيد الحي) ───────────────────
-- جدول مصدر الفيد لكل عميل (رابط + حالة آخر مزامنة)
CREATE TABLE IF NOT EXISTS client_catalogs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'auto',          -- auto | csv | xml | json
  sync_status TEXT NOT NULL DEFAULT 'idle',     -- idle | syncing | ok | error
  items_total INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- جدول المنتجات — كل صف منتج واحد (تفرد: عميل + معرّف خارجي)
CREATE TABLE IF NOT EXISTS catalog_products (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  old_price REAL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  in_stock INTEGER NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_deal INTEGER NOT NULL DEFAULT 0,            -- ضمن عروض اللقطة
  is_bride_essential INTEGER NOT NULL DEFAULT 0, -- أساسي في جهاز العروسة
  attrs_json TEXT NOT NULL DEFAULT '',          -- سمات إضافية (مقاس/لون/جنس/MPN/مجموعة)
  content_hash TEXT NOT NULL DEFAULT '',        -- بصمة المحتوى للكشف عن التغييرات
  first_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (client_id, external_id)
);

-- سجل تغييرات الكتالوج (new | updated | price_changed | stock_changed)
CREATE TABLE IF NOT EXISTS catalog_changes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catprod_client ON catalog_products (client_id, category);
CREATE INDEX IF NOT EXISTS idx_catprod_name ON catalog_products (client_id, name);
CREATE INDEX IF NOT EXISTS idx_catchange_client ON catalog_changes (client_id, created_at);

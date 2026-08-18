/**
 * @cbd/db — طبقة البيانات (واجهة موحّدة غير متزامنة)
 * - التطوير/الديمو: node:sqlite (مدمج في Node 22 — صفر تبعيات خارجية)
 * - الإنتاج: PostgreSQL عبر pg
 * - الكاش/النبضات: Redis عند توفرها، وإلا fallback في الذاكرة (TTL) للتطوير
 *
 * كل الدوال Promise-based لدعم المحركين بشفافية.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HeartbeatRecord, Provider, UsageEvent } from '@cbd/shared';

// ─────────────────────────────── محرك SQL ───────────────────────────────

type Row = Record<string, unknown>;
export interface Db {
  all(sql: string, ...params: unknown[]): Promise<Row[]>;
  get(sql: string, ...params: unknown[]): Promise<Row | undefined>;
  run(sql: string, ...params: unknown[]): Promise<{ lastInsertId: string | number; changes: number }>;
  exec(sql: string): Promise<void>;
}


/** موقع schema.sql — يعمل في CJS (dist) وأثناء التطوير */
function schemaPath(): string {
  const candidates = [
    join(__dirname, 'schema.sql'),               // dist/ بعد البناء
    join(__dirname, '..', 'src', 'schema.sql'),  // أثناء التطوير
    join(process.cwd(), 'packages', 'db', 'src', 'schema.sql'),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* جرّب التالي */
    }
  }
  return candidates[0]!;
}

function sqliteOpen(path: string): Db {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const raw = new DatabaseSync(path === ':memory:' ? ':memory:' : path);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA busy_timeout = 5000;');
  return {
    async all(sql, ...params) {
      return raw.prepare(sql).all(...(params as any[])) as Row[];
    },
    async get(sql, ...params) {
      return (raw.prepare(sql).get(...(params as any[])) as Row | undefined) ?? undefined;
    },
    async run(sql, ...params) {
      const res = raw.prepare(sql).run(...(params as any[]));
      return { lastInsertId: String(res.lastInsertRowid ?? ''), changes: Number(res.changes ?? 0) };
    },
    async exec(sql) {
      raw.exec(sql);
    },
  };
}

function pgOpen(connectionString: string): Db {
  const { Pool } = require('pg') as typeof import('pg');
  const pool = new Pool({ connectionString });
  const convert = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  return {
    async all(sql, ...params) {
      const r = await pool.query(convert(sql), params);
      return r.rows as Row[];
    },
    async get(sql, ...params) {
      const r = await pool.query(convert(sql), params);
      return (r.rows[0] as Row | undefined) ?? undefined;
    },
    async run(sql, ...params) {
      const r = await pool.query(convert(sql), params);
      return { lastInsertId: '', changes: r.rowCount ?? 0 };
    },
    async exec(sql) {
      await pool.query(sql);
    },
  };
}

const isPg = (url: string) => url.startsWith('postgres://') || url.startsWith('postgresql://');

/** قاعدة البيانات — كائن واحد للعملية كلها */
export const db: Db = (() => {
  const url = process.env.DATABASE_URL ?? 'file:./data/cbd.db';
  if (isPg(url)) return pgOpen(url);
  const path = url.replace(/^file:/, '');
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return sqliteOpen(path);
})();

// ─────────────────────────────── الترحيلات ───────────────────────────────

export async function migrate(): Promise<void> {
  const schema = readFileSync(schemaPath(), 'utf8');
  const version = 3;
  let applied: Row | undefined;
  try {
    applied = await db.get('SELECT version FROM _migrations ORDER BY version DESC LIMIT 1');
  } catch {
    applied = undefined; // أول تشغيل — الجداول لم تُنشأ بعد
  }
  if (applied && Number(applied.version) >= version) return;

  if (isPg(process.env.DATABASE_URL ?? '')) {
    const pgSchema = schema
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGSERIAL PRIMARY KEY')
      .replace(/TEXT PRIMARY KEY/g, 'TEXT PRIMARY KEY');
    await db.exec(pgSchema);
  } else {
    await db.exec(schema);
  }
  await db.run('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)', version, Date.now());
}

// ─────────────────────────────── كاش TTL (ذاكرة / Redis) ───────────────────────────────

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  keys(prefix: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

function memoryCache(): Cache {
  const map = new Map<string, { v: string; exp: number }>();
  const sweep = () => {
    const now = Date.now();
    for (const [k, e] of map) if (e.exp < now) map.delete(k);
  };
  const timer = setInterval(sweep, 30_000);
  timer.unref?.();
  return {
    async get(key) {
      const e = map.get(key);
      if (!e) return null;
      if (e.exp < Date.now()) {
        map.delete(key);
        return null;
      }
      return e.v;
    },
    async set(key, value, ttlSeconds) {
      map.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
    },
    async incr(key, ttlSeconds) {
      const e = map.get(key);
      const next = e && e.exp >= Date.now() ? Number(e.v) + 1 : 1;
      map.set(key, { v: String(next), exp: Date.now() + ttlSeconds * 1000 });
      return next;
    },
    async keys(prefix) {
      sweep();
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
    async del(key) {
      map.delete(key);
    },
  };
}

function redisCache(url: string): Cache {
  const Redis = require('ioredis');
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  client.connect().catch(() => {});
  return {
    async get(key) {
      try {
        return await client.get(key);
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await client.set(key, value, 'EX', ttlSeconds);
      } catch {}
    },
    async incr(key, ttlSeconds) {
      try {
        const n = await client.incr(key);
        await client.expire(key, ttlSeconds);
        return n;
      } catch {
        return 1;
      }
    },
    async keys(prefix) {
      try {
        return await client.keys(`${prefix}*`);
      } catch {
        return [];
      }
    },
    async del(key) {
      try {
        await client.del(key);
      } catch {}
    },
  };
}

/** الكاش المشترك — نبضات TTL، حدود معدل، عدادات لحظية */
export const cache: Cache = process.env.REDIS_URL
  ? redisCache(process.env.REDIS_URL)
  : memoryCache();

// ─────────────────────────────── أدوات مساعدة ───────────────────────────────

export const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

export const now = () => Date.now();

export function json<T>(value: unknown, fallback: T): T {
  if (value == null || value === '' || value === '{}' || value === '[]') return fallback;
  // إذا كان كائناً بالفعل (فُك سابقاً) أعدّه كما هو
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─────────────────────────────── سجلات العدادات ───────────────────────────────

export async function recordUsage(e: UsageEvent): Promise<void> {
  await db.run(
    `INSERT INTO usage_events
      (id, client_id, bot_id, provider_id, model, tokens_in, tokens_out, latency_ms, status, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.id, e.clientId, e.botId, e.providerId, e.model, e.tokensIn, e.tokensOut,
    e.latencyMs, e.status, e.costUsd, e.createdAt
  );
  const day = new Date(e.createdAt).toISOString().slice(0, 10);
  await db.run(
    `INSERT INTO usage_daily
      (day, client_id, bot_id, provider_id, model, msg_count, tokens_in, tokens_out, cost_usd)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(day, client_id, bot_id, provider_id, model)
     DO UPDATE SET msg_count = msg_count + 1,
                   tokens_in = tokens_in + excluded.tokens_in,
                   tokens_out = tokens_out + excluded.tokens_out,
                   cost_usd = cost_usd + excluded.cost_usd`,
    day, e.clientId, e.botId, e.providerId, e.model, e.tokensIn, e.tokensOut, e.costUsd
  );
}

export async function recordHeartbeat(h: Omit<HeartbeatRecord, 'id'> & { id?: string }): Promise<void> {
  await db.run(
    `INSERT INTO heartbeat_logs (id, provider_id, ok, latency_ms, message, at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    h.id ?? id('hb'), h.providerId, h.ok ? 1 : 0, h.latencyMs, h.message, h.at
  );
  await db.run(
    `DELETE FROM heartbeat_logs WHERE provider_id = ?
       AND id NOT IN (SELECT id FROM heartbeat_logs WHERE provider_id = ? ORDER BY at DESC LIMIT 2000)`,
    h.providerId, h.providerId
  );
}

export async function listEnabledProviders(): Promise<Array<Provider & { apiKeyEnc: string }>> {
  const rows = await db.all('SELECT * FROM providers WHERE enabled = 1');
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind) as Provider['kind'],
    baseUrl: String(r.base_url ?? ''),
    apiKey: '', // لا نعيد المفتاح من طبقة البيانات — يُفك في طبقة الخدمة فقط
    apiKeyEnc: String((r as any).api_key_enc ?? ''),
    enabled: Number((r as any).enabled) === 1,
    tier: String((r as any).tier) as 'free' | 'paid',
    limits: json<any>((r as any).limits_json, null),
    createdAt: Number((r as any).created_at),
  }));
}

export async function getProviderHealthRaw(providerId: string): Promise<{
  lastPulse: number | null;
  ok: boolean | null;
  ewmaLatencyMs: number | null;
  successRate: number | null;
}> {
  const last = await db.get(
    'SELECT * FROM heartbeat_logs WHERE provider_id = ? ORDER BY at DESC LIMIT 1',
    providerId
  );
  if (!last) return { lastPulse: null, ok: null, ewmaLatencyMs: null, successRate: null };
  const recent = (await db.all(
    'SELECT ok, latency_ms FROM heartbeat_logs WHERE provider_id = ? ORDER BY at DESC LIMIT 20',
    providerId
  )) as Array<{ ok: number; latency_ms: number }>;
  const okCount = recent.filter((r) => Number(r.ok) === 1).length;
  const lat = recent.filter((r) => Number(r.latency_ms) > 0).map((r) => Number(r.latency_ms));
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  return {
    lastPulse: Number(last.at),
    ok: Number(last.ok) === 1,
    ewmaLatencyMs: Math.round(avg),
    successRate: recent.length ? okCount / recent.length : null,
  };
}

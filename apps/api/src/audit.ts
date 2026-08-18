/** سجل التدقيق — كل فعل حساس يُسجل ولا يُمحى من داخل التطبيق */
import { db, id, now } from '@cbd/db';

export function audit(opts: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}): void {
  try {
    void db.run(
      'INSERT INTO audit_logs (id, user_id, action, entity, entity_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id('aud'), opts.userId ?? null, opts.action, opts.entity, opts.entityId ?? null,
      opts.meta ? JSON.stringify(opts.meta) : null, now()
    ).catch(() => {});
  } catch (err) {
    console.error('audit failed', err);
  }
}

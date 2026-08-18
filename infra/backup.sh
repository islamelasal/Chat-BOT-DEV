#!/usr/bin/env bash
# نسخ احتياطي يومي (يُجدول عبر cron):
# 0 3 * * * /opt/chat-bot-dev/infra/backup.sh >> /var/log/chatbotdev-backup.log 2>&1
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/opt/chat-bot-dev/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y-%m-%d_%H%M%S)

echo "[$DATE] بدء النسخ الاحتياطي..."

# قاعدة البيانات
docker compose -f "$(dirname "$0")/docker-compose.yml" exec -T postgres \
  pg_dump -U chatbotdev chatbotdev | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"

# الملفات (بيانات التطبيق)
tar -czf "$BACKUP_DIR/data-$DATE.tar.gz" -C "$(dirname "$0")/.." apps/api/data 2>/dev/null || true

# تنظيف القديم
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete

echo "[$DATE] اكتمل — الحجم: $(du -sh "$BACKUP_DIR" | cut -f1)"
# اختبار استعادة شهري: قم بتشغيل يدوي:
# gunzip < db-XXX.sql.gz | docker compose exec -T postgres psql -U chatbotdev chatbotdev

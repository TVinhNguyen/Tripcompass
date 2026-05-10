#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  TripCompass — Upload Backup to Production Server                          ║
# ║  Usage: bash scripts/upload-backup.sh <backup-file> [server-alias]         ║
# ║  Example: bash scripts/upload-backup.sh backups/tripcompass_20260510.sql.gz ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

BACKUP_FILE="${1:-.}"
SERVER_ALIAS="${2:-tripcompass-server}"
REMOTE_PATH="/tmp/tripcompass-backup.sql.gz"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "📤 Uploading backup to production server..."
echo "   🔗 Server: $SERVER_ALIAS"
echo "   📁 Local: $BACKUP_FILE ($FILE_SIZE)"
echo "   📍 Remote: $REMOTE_PATH"

scp "$BACKUP_FILE" "$SERVER_ALIAS:$REMOTE_PATH"

echo "✅ Upload complete!"
echo ""
echo "Next steps on server:"
echo "  1. SSH into server: ssh $SERVER_ALIAS"
echo "  2. Restore database:"
echo "     gunzip < $REMOTE_PATH | docker compose -f docker-compose.prod.yml exec -T postgres psql -U tripcompass_admin -d tripcompass"
echo ""
echo "Or run:"
echo "  ssh $SERVER_ALIAS 'bash /tmp/restore-db.sh $REMOTE_PATH'"

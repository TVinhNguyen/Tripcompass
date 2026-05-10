#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  TripCompass — Restore Database on Production Server                       ║
# ║  Usage: bash /tmp/restore-db.sh <backup-file>                              ║
# ║  (Run this on the production server after uploading backup)                 ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

BACKUP_FILE="${1:-/tmp/tripcompass-backup.sql.gz}"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "⏳ Restoring database from backup..."
echo "   📁 Backup: $BACKUP_FILE"
echo "   🐘 Database: tripcompass"

# Ensure postgres container is running
if ! docker compose -f "$DOCKER_COMPOSE_FILE" ps postgres | grep -q "Up"; then
    echo "🚀 Starting PostgreSQL..."
    docker compose -f "$DOCKER_COMPOSE_FILE" up -d postgres
    sleep 5
fi

# Wait for DB to be ready
echo "⏳ Waiting for database to be ready..."
docker compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres \
    pg_isready -U tripcompass_admin -d tripcompass || {
    echo "Retrying..."
    sleep 3
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres \
        pg_isready -U tripcompass_admin -d tripcompass
}

# Restore backup
echo "📥 Importing data..."
gunzip -c "$BACKUP_FILE" | \
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres \
    psql -U tripcompass_admin -d tripcompass

echo "✅ Database restored successfully!"
echo ""
echo "Cleanup:"
echo "  rm $BACKUP_FILE"

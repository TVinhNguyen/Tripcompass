#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  TripCompass — Export Database from Local to File                          ║
# ║  Usage: bash scripts/export-db.sh                                          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./database/backups"
BACKUP_FILE="$BACKUP_DIR/tripcompass_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "📦 Exporting PostgreSQL database from Docker..."
echo "📍 Output: $BACKUP_FILE"

# Method 1: If container is running
if docker compose ps postgres | grep -q "Up"; then
    echo "✓ PostgreSQL container is running"
    docker compose exec -T postgres pg_dump \
        -U postgres \
        -d tripcompass \
        --schema=schema_travel \
        --no-password \
        > "$BACKUP_FILE"
else
    echo "✗ PostgreSQL container not running. Starting containers..."
    docker compose up -d postgres
    sleep 5
    
    docker compose exec -T postgres pg_dump \
        -U postgres \
        -d tripcompass \
        --schema=schema_travel \
        --no-password \
        > "$BACKUP_FILE"
fi

# Compress backup
echo "🗜️  Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Database exported successfully!"
echo "   📁 File: $BACKUP_FILE"
echo "   📊 Size: $FILE_SIZE"

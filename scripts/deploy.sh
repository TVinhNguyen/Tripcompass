#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  TripCompass — Production Deploy Script                                    ║
# ║  Runs on the server via CD pipeline or manually.                           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/tripcompass}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

cd "$DEPLOY_DIR"

# ── Pre-flight checks ────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Missing $DEPLOY_DIR/$ENV_FILE — copy from .env.prod.example and fill in values"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "❌ Docker not installed"
  exit 1
fi

echo "🚀 Deploying TripCompass from $DEPLOY_DIR"
echo "   Compose: $COMPOSE_FILE"
echo "   Env:     $ENV_FILE"
echo ""

# ── Pull latest images ───────────────────────────────────────────────────────
echo "📦 Pulling latest images..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull

# ── Bring up services ────────────────────────────────────────────────────────
echo "🔄 Starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

# ── Wait for health checks ───────────────────────────────────────────────────
echo "⏳ Waiting for services to become healthy..."
sleep 10

echo ""
echo "📊 Service status:"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

# ── Cleanup old images ───────────────────────────────────────────────────────
echo ""
echo "🧹 Cleaning up dangling images..."
docker image prune -f --filter "until=48h" 2>/dev/null || true

echo ""
echo "✅ Deploy complete!"

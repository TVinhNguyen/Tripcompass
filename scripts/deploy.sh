#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  TripCompass — Production Deploy Script                                    ║
# ║  Runs on the server via CD pipeline or manually.                           ║
# ║                                                                            ║
# ║  Inputs (env):                                                             ║
# ║    DEPLOY_DIR — project root on the server (default /opt/tripcompass)      ║
# ║    IMAGE_TAG  — image tag to deploy (e.g. sha-abc1234). Falls back to the  ║
# ║                 value in .env.prod, then to "latest".                      ║
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

if [ ! -f "caddy/Caddyfile" ]; then
  echo "❌ Missing $DEPLOY_DIR/caddy/Caddyfile — required for the reverse proxy"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "❌ Docker not installed"
  exit 1
fi

# ── Compose invocation: forward IMAGE_TAG if the CD pipeline pinned one ──────
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
if [ -n "${IMAGE_TAG:-}" ]; then
  export IMAGE_TAG
  echo "🏷  Image tag: $IMAGE_TAG (pinned)"
else
  echo "🏷  Image tag: from $ENV_FILE (falls back to 'latest')"
fi

echo "🚀 Deploying TripCompass from $DEPLOY_DIR"
echo "   Compose: $COMPOSE_FILE"
echo "   Env:     $ENV_FILE"
echo ""

# ── Validate Compose config before pulling / swapping containers ─────────────
echo "🔍 Validating Docker Compose config..."
"${COMPOSE[@]}" config >/dev/null

# ── Validate Caddyfile before swapping containers ────────────────────────────
echo "🔍 Validating Caddyfile..."
docker run --rm \
  -v "$DEPLOY_DIR/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  --env-file "$ENV_FILE" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# ── Pull pinned images ───────────────────────────────────────────────────────
echo "📦 Pulling images..."
"${COMPOSE[@]}" pull

# ── Bring up services ────────────────────────────────────────────────────────
echo "🔄 Starting services..."
"${COMPOSE[@]}" up -d --remove-orphans

# ── Wait for health checks ───────────────────────────────────────────────────
echo "⏳ Waiting for services to become healthy..."
deadline=$((SECONDS + 180))
required_health_services=(postgres redis planner-ai backend frontend)

while true; do
  unhealthy=()

  for service in "${required_health_services[@]}"; do
    container_id="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
    if [ -z "$container_id" ]; then
      unhealthy+=("$service:missing")
      continue
    fi

    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo unknown)"
    if [ "$status" != "healthy" ] && [ "$status" != "running" ]; then
      unhealthy+=("$service:$status")
    fi
  done

  if [ "${#unhealthy[@]}" -eq 0 ]; then
    break
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "❌ Services failed to become healthy: ${unhealthy[*]}"
    echo ""
    "${COMPOSE[@]}" ps
    echo ""
    echo "Recent logs:"
    "${COMPOSE[@]}" logs --tail=80 planner-ai backend frontend caddy || true
    exit 1
  fi

  sleep 5
done

echo ""
echo "📊 Service status:"
"${COMPOSE[@]}" ps

# ── Cleanup old images ───────────────────────────────────────────────────────
echo ""
echo "🧹 Cleaning up dangling images..."
docker image prune -f --filter "until=48h" 2>/dev/null || true

echo ""
echo "✅ Deploy complete!"

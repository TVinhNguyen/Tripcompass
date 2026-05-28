# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching).
#
# BuildKit cache mount keeps the downloaded pip wheels between builds on the
# same host — when requirements.txt hasn't changed, the RUN layer is cached
# entirely and skipped (instant). When it DOES change, only the diff is
# re-downloaded instead of all ~500MB of the LangChain stack.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt

# ---- Runtime stage ----
FROM python:3.11-slim

# Security: non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd  --uid 1001 --gid appgroup --shell /bin/false appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY app/ ./app/

# Switch to non-root user
USER appuser

EXPOSE 8090

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8090/health', timeout=3).read()" || exit 1

# Single worker: the workload is I/O-bound (httpx + asyncpg + Redis) and a
# second worker would double LLM client + DB pool memory without throughput gain.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1"]

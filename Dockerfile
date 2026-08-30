FROM python:3.11-slim

ARG BUILD_ID=unknown
ARG BUILD_TIME=unknown
ARG BUILD_BRANCH=unknown
ARG BUILD_ENV=prod
ENV BUILD_ID=${BUILD_ID}
ENV BUILD_TIME=${BUILD_TIME}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_ENV=${BUILD_ENV}
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
# Deploy resilience (fix/deploy-build-resilience):
# - retry with backoff for transient DNS/pypi failures;
# - BuildKit cache mount keeps wheels between --no-cache deploy builds
#   (hence no --no-cache-dir: the cache lives in the mount, not the layer);
# - PIP_INDEX_URL build-arg allows an internal mirror without code changes.
ARG PIP_INDEX_URL=
RUN --mount=type=cache,target=/root/.cache/pip \
    set -e; \
    PIP_ARGS="--timeout 60"; \
    if [ -n "$PIP_INDEX_URL" ]; then PIP_ARGS="$PIP_ARGS --index-url $PIP_INDEX_URL"; fi; \
    attempt=1; \
    until pip install $PIP_ARGS -r /app/backend/requirements.txt; do \
      if [ "$attempt" -ge 3 ]; then \
        echo "[build] pip install failed after $attempt attempts — dependency stage FAILED" >&2; \
        exit 1; \
      fi; \
      echo "[build] pip install attempt $attempt failed; retrying in $((attempt * 15))s..." >&2; \
      sleep $((attempt * 15)); \
      attempt=$((attempt + 1)); \
    done

COPY backend /app/backend
RUN chmod +x /app/backend/docker-entrypoint.sh

# Graphify render pipeline (feature/admin-graphs-tab): render script + config
# must be present for /api/admin/graphs/rebuild background jobs.
COPY tools/graphify-render-graph.py tools/graphify-semantic-config.json /app/tools/

RUN mkdir -p /app/workspace/processes /app/workspace/.session_store

EXPOSE 8000

CMD ["/app/backend/docker-entrypoint.sh"]

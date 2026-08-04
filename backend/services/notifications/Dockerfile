FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Deploy resilience (fix/deploy-build-resilience): apt/pip retry with
# backoff for transient DNS/mirror failures; pip cache mount + optional
# PIP_INDEX_URL mirror (same contract as the api Dockerfile).
RUN set -e; \
    attempt=1; \
    until apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev; do \
      if [ "$attempt" -ge 3 ]; then \
        echo "[build] apt-get failed after $attempt attempts — dependency stage FAILED" >&2; \
        exit 1; \
      fi; \
      echo "[build] apt-get attempt $attempt failed; retrying in $((attempt * 15))s..." >&2; \
      sleep $((attempt * 15)); \
      attempt=$((attempt + 1)); \
    done; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
ARG PIP_INDEX_URL=
RUN --mount=type=cache,target=/root/.cache/pip \
    set -e; \
    PIP_ARGS="--timeout 60"; \
    if [ -n "$PIP_INDEX_URL" ]; then PIP_ARGS="$PIP_ARGS --index-url $PIP_INDEX_URL"; fi; \
    attempt=1; \
    until pip install $PIP_ARGS -r requirements.txt; do \
      if [ "$attempt" -ge 3 ]; then \
        echo "[build] pip install failed after $attempt attempts — dependency stage FAILED" >&2; \
        exit 1; \
      fi; \
      echo "[build] pip install attempt $attempt failed; retrying in $((attempt * 15))s..." >&2; \
      sleep $((attempt * 15)); \
      attempt=$((attempt + 1)); \
    done

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

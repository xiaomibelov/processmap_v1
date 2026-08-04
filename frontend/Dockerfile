# Multi-stage production build: Vite static bundle → nginx:alpine
FROM node:20-alpine AS build

ARG VITE_BUILD_ID=dev
ARG VITE_BUILD_TIME=unknown
ARG VITE_BUILD_BRANCH=unknown
ARG VITE_BUILD_ENV=prod
ARG VITE_DEPLOY_FINGERPRINT=
ARG VITE_DEPLOY_REQUESTED_REF=
ARG VITE_DEPLOY_RESOLVED_SHA=

ENV VITE_BUILD_ID=${VITE_BUILD_ID}
ENV VITE_BUILD_TIME=${VITE_BUILD_TIME}
ENV VITE_BUILD_BRANCH=${VITE_BUILD_BRANCH}
ENV VITE_BUILD_ENV=${VITE_BUILD_ENV}
ENV VITE_DEPLOY_FINGERPRINT=${VITE_DEPLOY_FINGERPRINT}
ENV VITE_DEPLOY_REQUESTED_REF=${VITE_DEPLOY_REQUESTED_REF}
ENV VITE_DEPLOY_RESOLVED_SHA=${VITE_DEPLOY_RESOLVED_SHA}

WORKDIR /app
COPY package*.json .npmrc ./
# Deploy resilience (fix/deploy-build-resilience):
# - npm can die on network flakes with exit code 0 ("Exit handler never
#   called!"), letting the build reach `npm run build` without devDeps
#   (vite: not found, exit 127). Verify a real artifact after install.
# - Retry with backoff to ride out transient DNS/registry failures.
# - BuildKit cache mount keeps tarballs between --no-cache deploy builds,
#   reducing network exposure on rebuilds.
# - NPM_REGISTRY build-arg allows pointing npm at an internal mirror
#   without code changes (empty = default registry).
ARG NPM_REGISTRY=
RUN --mount=type=cache,target=/root/.npm \
    set -e; \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi; \
    attempt=1; \
    until npm ci --include=dev && test -x node_modules/.bin/vite; do \
      if [ "$attempt" -ge 3 ]; then \
        echo "[build] npm ci failed after $attempt attempts (or node_modules/.bin/vite missing) — dependency stage FAILED" >&2; \
        exit 1; \
      fi; \
      echo "[build] npm ci attempt $attempt failed; retrying in $((attempt * 15))s..." >&2; \
      sleep $((attempt * 15)); \
      attempt=$((attempt + 1)); \
    done
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 5177

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=5s \
    CMD ["sh", "-c", "curl -fsS http://localhost:5177/ >/dev/null || curl -fsS http://localhost:80/ >/dev/null || exit 1"]

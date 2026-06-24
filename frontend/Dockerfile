# Multi-stage production build: Vite static bundle → nginx:alpine
FROM node:20-alpine AS build

RUN apk add --no-cache git

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
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 5177

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=5s \
    CMD ["sh", "-c", "curl -fsS http://localhost:5177/ >/dev/null || curl -fsS http://localhost:80/ >/dev/null || exit 1"]

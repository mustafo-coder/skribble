# syntax=docker/dockerfile:1
# Build context MUST be the repo root (monorepo workspaces).
# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/frontend/package.json apps/frontend/
RUN npm install

COPY packages/shared packages/shared
COPY apps/frontend apps/frontend

# Same-origin by default: the edge Nginx proxies /api and /socket to the backend,
# so the client uses relative URLs (empty VITE_*). Override at build for split origins.
ARG VITE_API_URL=""
ARG VITE_SOCKET_URL=""
ENV VITE_API_URL=$VITE_API_URL VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build -w @skribble/frontend

# ─── Runtime stage (static via Nginx) ─────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=4s CMD wget -qO- http://127.0.0.1/ || exit 1

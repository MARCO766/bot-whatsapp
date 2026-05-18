# syntax=docker/dockerfile:1
# MacBot — build de producción (sin Nixpacks)
# Etapas: frontend Vite → deps backend → imagen final Alpine

ARG NODE_VERSION=22.14.0

# ─── 1) React / Vite ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci --ignore-scripts

COPY frontend/ ./

ENV NODE_ENV=production

RUN npm run build

# ─── 2) Dependencias backend (solo producción) ─────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS backend-deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

# ─── 3) Imagen final ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN addgroup -g 1001 -S nodejs \
 && adduser -S macbot -u 1001 -G nodejs

COPY --from=backend-deps --chown=macbot:nodejs /app/node_modules ./node_modules

COPY --chown=macbot:nodejs \
  package.json \
  server.js \
  ./

COPY --chown=macbot:nodejs routes ./routes
COPY --chown=macbot:nodejs services ./services
COPY --chown=macbot:nodejs middlewares ./middlewares
COPY --chown=macbot:nodejs jobs ./jobs
COPY --chown=macbot:nodejs utils ./utils
COPY --chown=macbot:nodejs views ./views
COPY --chown=macbot:nodejs public ./public

COPY --from=frontend-build --chown=macbot:nodejs /app/frontend/dist ./frontend/dist

USER macbot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/flujos/status',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]

FROM node:22.23.3-slim AS builder

WORKDIR /app

COPY ./frontend/package*.json .

RUN npm ci

COPY ./frontend .

ARG VITE_API_BASE_URL=/

RUN npm run build

FROM caddy:2-alpine

COPY --from=builder /app/dist /srv

COPY ./frontend/Caddyfile /etc/caddy/Caddyfile

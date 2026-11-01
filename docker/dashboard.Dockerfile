# The dashboard, built as a static bundle and served by Caddy.
#
# Two stages, because a Vite build needs dev dependencies and a node toolchain
# and the runtime needs neither: the second stage is `caddy:2-alpine` (about
# 25 MB) with the built files and a Caddyfile.
#
#   docker build -f docker/dashboard.Dockerfile \
#     --build-arg VITE_API_URL= -t aeroscribe-dashboard .
#
# `VITE_API_URL=""` (present, empty) means **same origin**, which is the point of
# putting Caddy in front of both: the browser calls `/api/v1/…` on the origin it
# already loaded, so there is no CORS preflight, no second origin in the token
# story, and no API address baked into a bundle that might be served somewhere
# else. Leaving the argument out entirely builds the fixture-only dashboard,
# which says so on every screen.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifests first: a source change then reuses the install layer.
COPY package.json package-lock.json ./
COPY apps/landing-page/package.json apps/landing-page/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/contract/package.json packages/contract/
COPY packages/pipeline/package.json packages/pipeline/
COPY packages/ui/package.json packages/ui/
COPY services/api/package.json services/api/
RUN npm ci --ignore-scripts && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/dashboard apps/dashboard

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# The bundle is served from the origin root here, not from the Pages sub-path.
# Vite bakes `base` into every asset URL, so getting this wrong serves an
# index.html whose scripts 404 — a blank page that looks like an API problem.
ENV BASE_PATH=/
RUN npm run build -w @aeroscribe/dashboard

FROM caddy:2-alpine AS runtime
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/dashboard/dist /srv/www
EXPOSE 80 443

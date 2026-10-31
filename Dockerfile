# AeroScribe API — container image
#
#   docker build -t aeroscribe-api .
#   docker run --rm -p 8787:8787 \
#     -e AEROSCRIBE_API_KEY="$(openssl rand -hex 32)" \
#     -e AEROSCRIBE_CONTACT_EMAIL=you@example.org \
#     -v aeroscribe-data:/data \
#     aeroscribe-api
#
# The service runs from TypeScript source through `tsx`, which is a production
# dependency rather than a dev convenience. There is no `tsc` emit step because
# `@aeroscribe/pipeline` is consumed as source too; compiling would need a
# project-reference build for both packages, and running the source keeps the
# image, the tests and the smoke scripts on exactly the same code.
#
# Debian slim rather than Alpine on purpose: `tsx` carries esbuild, and the musl
# build is a combination this repository cannot test locally. The glibc base is
# the one the test suite and the smoke scripts run on.

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    AEROSCRIBE_DATA_DIR=/data

# Manifests first: a source-only change then reuses the install layer.
COPY package.json package-lock.json ./
COPY apps/landing-page/package.json apps/landing-page/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/pipeline/package.json packages/pipeline/
COPY packages/ui/package.json packages/ui/
COPY services/api/package.json services/api/

# --omit=dev is the point of keeping tsx in "dependencies": this install must
# still boot the service. Adding a new workspace means adding its manifest above;
# npm fails loudly rather than silently installing a partial tree.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/pipeline packages/pipeline
COPY services/api services/api

# The registry, runs and audit trail live here. Mount a volume at /data or the
# evidence chain dies with the container.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec node directly rather than `npm run start`: npm would sit between PID 1
# and the process, so `docker stop` would signal npm and not the server.
CMD ["node", "--import", "tsx", "services/api/src/index.ts"]

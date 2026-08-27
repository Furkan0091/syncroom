# Build stage
FROM node:24-alpine AS build
WORKDIR /app

# Monorepo manifests first for layer caching.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --no-audit --no-fund

# Server sources + prisma schema.
COPY server/tsconfig.json server/tsconfig.json
COPY server/tsup.config.ts server/tsup.config.ts
COPY server/prisma server/prisma
COPY server/src server/src

WORKDIR /app/server
RUN npx prisma generate && npm run build

# Runtime stage (keeps dev deps so `prisma migrate deploy` runs at boot).
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --no-audit --no-fund

COPY --from=build /app/server/dist /app/server/dist
COPY --from=build /app/server/node_modules/.prisma /app/server/node_modules/.prisma
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY server/prisma /app/server/prisma

WORKDIR /app/server
EXPOSE 4100
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN bun install --production

FROM oven/bun:1-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src

# Session data (zalo-session.json) must be persisted via a volume mount.
# -v /host/path/to/zalo-data:/app/data
VOLUME ["/app/data"]

EXPOSE 3099

CMD ["bun", "src/main.ts"]

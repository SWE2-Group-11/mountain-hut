# Build stage: install all dependencies (better-sqlite3 needs a toolchain
# if no prebuilt binary is available) and compile TypeScript to dist/
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# SQL scripts are read at runtime from <cwd>/src/database/sql
COPY src/database/sql ./src/database/sql
RUN mkdir -p /app/data
EXPOSE 3000
# Create and seed the database on first start, keep it on later starts
CMD ["sh", "-c", "[ -f \"$DB_PATH\" ] || export RESET_DB=true; exec node dist/index.js"]

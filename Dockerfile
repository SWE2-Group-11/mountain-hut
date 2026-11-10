# Single image with the whole system: backend, frontend and Mailpit

# Backend build
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

# Frontend build
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# Final image
FROM node:22-bookworm-slim
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

## Mailpit
COPY --from=axllent/mailpit:v1.27.0 /mailpit /usr/local/bin/mailpit

## Frontend
COPY --from=frontend-build /app/frontend /app/frontend

## Backend
WORKDIR /app/backend
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY backend/package.json ./
# SQL scripts are read at runtime from <cwd>/src/database/sql
COPY backend/src/database/sql ./src/database/sql
RUN mkdir -p /app/data

# 5173 frontend, 3000 REST API, 8025 Mailpit web UI
EXPOSE 5173 3000 8025

# Start Mailpit and the frontend in the background, then the backend.
# The database is created and seeded on the first start and kept on later starts.
CMD ["sh", "-c", "mailpit & (cd /app/frontend && exec npx vite preview --host 0.0.0.0 --port 5173 --strictPort) & [ -f \"$DB_PATH\" ] || export RESET_DB=true; exec node dist/index.js"]
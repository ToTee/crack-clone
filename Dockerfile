FROM node:22-slim AS base

# 1. 의존성 설치
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ gcc && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci

# 2. 빌드
FROM base AS builder
RUN apt-get update && apt-get install -y python3 make g++ gcc && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Remove NAS metadata only from the disposable build copy.
RUN find /app -type d -name @eaDir -prune -exec rm -rf {} +

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

# 3. 실행 환경
FROM base AS runner
RUN apt-get update && apt-get install -y python3 make g++ gcc && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# better-sqlite3를 컨테이너 안에서 재컴파일
COPY package.json package-lock.json* ./
RUN npm install better-sqlite3 --build-from-source

EXPOSE 3000
CMD ["node", "server.js"]

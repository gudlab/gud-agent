FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm i -g pnpm

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source and build
COPY . .
RUN pnpm build

# ─── Production ───
FROM node:20-slim

WORKDIR /app

RUN npm i -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod

COPY --from=builder /app/dist ./dist
COPY knowledge ./knowledge

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/index.js"]

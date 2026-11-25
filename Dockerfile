
# Stage 1: Build
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Run
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# ??? FFmpeg ???? ??????? ???? ?????
RUN apt-get update && apt-get install -y ffmpeg openssl libssl-dev && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/main.js"]

# Stage 1: Budowanie aplikacji
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Środowisko produkcyjne Cloud Run
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js

# Cloud Run domyślnie przekazuje zmienną PORT (zazwyczaj 8080)
EXPOSE 8080
ENV PORT=8080

CMD ["node", "server.js"]

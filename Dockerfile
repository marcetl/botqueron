# ============================
# Stage 1: Build
# ============================
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependencias primero (capa cacheada si package.json no cambia)
COPY package*.json ./
RUN npm ci

# Copiar el resto del código
COPY . .

# Variables de entorno de build (se inyectan desde Coolify como Build Variables)
ARG PUBLIC_N8N_WEBHOOK_URL
ARG PUBLIC_WHATSAPP_NUMBER
ENV PUBLIC_N8N_WEBHOOK_URL=$PUBLIC_N8N_WEBHOOK_URL
ENV PUBLIC_WHATSAPP_NUMBER=$PUBLIC_WHATSAPP_NUMBER

# Build de Astro → genera /app/dist (modo SSR con @astrojs/node)
RUN npm run build

# ============================
# Stage 2: Run con Node.js
# ============================
FROM node:22-alpine AS runner

WORKDIR /app

# Copiar la salida de build (servidor + cliente)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Variables de entorno de runtime
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321

# Arrancar el servidor Node generado por @astrojs/node (standalone)
CMD ["node", "dist/server/entry.mjs"]

# CafePOS API image for Railway. Pure backend (Fastify + Prisma); the React app is
# hosted separately on Vercel. Mirrors the AquaLab Railway setup.
FROM node:20-alpine

# Prisma needs OpenSSL at runtime.
RUN apk add --no-cache openssl

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install

# App source + generate the Prisma client.
COPY . .
RUN npm run db:generate -w server

ENV NODE_ENV=production \
    HOST=0.0.0.0
# Railway injects PORT at runtime; the server reads process.env.PORT (defaults to 4000).
EXPOSE 4000

# Apply migrations, ensure the catalog + admin login exist (idempotent), then start the API.
CMD ["sh", "-c", "npm run db:deploy -w server && npm run db:seed -w server && npm run start -w server"]

# Production image: the game server + the browser app it serves, one container.
# Build locally with:  docker build -t cardslayer . && docker run -p 8080:8080 -v cardslayer-data:/data cardslayer
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# /data is a persistent volume in production (see fly.toml) -- the SQLite
# database must survive restarts and deploys.
ENV PORT=8080 \
    DATABASE_PATH=/data/cardslayer.db \
    TRUST_PROXY=true
EXPOSE 8080

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]

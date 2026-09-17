# Production image: the game server + the browser app it serves, one container.
# Railway builds this automatically (see railway.json and docs/DEPLOY.md).
# Locally:  docker build -t cardslayer . && docker run -p 8080:8080 -e DATABASE_PATH=/data/cardslayer.db -v cardslayer-data:/data cardslayer
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# The database location comes from the host: Railway's volume is found through
# RAILWAY_VOLUME_MOUNT_PATH, anything else sets DATABASE_PATH (server/config.js).
ENV PORT=8080 \
    TRUST_PROXY=true
EXPOSE 8080

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]

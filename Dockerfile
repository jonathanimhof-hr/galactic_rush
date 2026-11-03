# Galactic Rush V8 multiplayer server (WebSocket lobbies, tournaments, race relay).
# Build from the repository root (the server reuses the game's rules in src/):
#   docker build -t galactic-rush-mp .
#   docker run -p 8787:8787 -e TOKEN_SECRET=<32+ random characters> -e ALLOWED_ORIGINS=https://<you>.github.io galactic-rush-mp
# Put it behind HTTPS (the host's TLS or a proxy) so the GitHub Pages site can reach it as wss://.
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/
RUN npm install --prefix server --omit=dev --no-audit --no-fund
COPY server server
COPY src src
# the root package.json declares the game's src/ files as ES modules
COPY package.json ./
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "server/index.mjs"]

# Code Crew on a VPS. Bring your own Claude subscription token: run `claude setup-token` on any machine
# and pass it as CLAUDE_CODE_OAUTH_TOKEN. Put Tailscale or an https reverse proxy in front; never expose plain http.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV CODE_CREW_HOST=0.0.0.0 CODE_CREW_PORT=4747 CODE_CREW_DATA=/data CODE_CREW_BOTS_DIR=/data/bots CODE_CREW_CWD=/data/bots
VOLUME ["/data"]
EXPOSE 4747
# CODE_CREW_TOKEN (access token for the UI) and CLAUDE_CODE_OAUTH_TOKEN are required at runtime.
CMD ["node", "bin/code-crew.js", "start"]

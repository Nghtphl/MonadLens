# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.20.0

FROM --platform=linux/amd64 node:${NODE_VERSION}-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=30000

FROM dependencies AS builder
COPY . .
RUN npm run build -- --webpack
RUN npm prune --omit=dev

FROM --platform=linux/amd64 node:${NODE_VERSION}-bookworm-slim AS runtime

ARG FOUNDRY_VERSION=1.5.1
ARG SLITHER_VERSION=0.11.4
ARG SOLC_VERSION=0.8.30

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-venv \
    && python3 -m venv /opt/slither \
    && /opt/slither/bin/pip install --no-cache-dir "slither-analyzer==${SLITHER_VERSION}" \
    && curl -fsSL "https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/foundry_v${FOUNDRY_VERSION}_linux_amd64.tar.gz" -o /tmp/foundry.tar.gz \
    && tar -xzf /tmp/foundry.tar.gz -C /usr/local/bin anvil \
    && curl -fsSL "https://github.com/ethereum/solidity/releases/download/v${SOLC_VERSION}/solc-static-linux" -o /usr/local/bin/solc \
    && chmod 0755 /usr/local/bin/anvil /usr/local/bin/solc \
    && rm -f /tmp/foundry.tar.gz \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder --chown=node:node /app ./

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ANVIL_PATH=/usr/local/bin/anvil \
    SLITHER_PATH=/opt/slither/bin/slither \
    PATH=/usr/local/sbin:/usr/local/bin:/opt/slither/bin:/usr/sbin:/usr/bin:/sbin:/bin

USER node
EXPOSE 3000

CMD ["npm", "start"]

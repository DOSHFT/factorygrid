ARG NODE_BASE_IMAGE=node:20-slim
FROM ${NODE_BASE_IMAGE}
ARG CLAUDE_CODE_VERSION=2.1.186

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git procps \
  && rm -rf /var/lib/apt/lists/*


RUN timeout 180 npm install -g --force "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" --no-audit --no-fund || true

WORKDIR /ui
COPY node-locked-install.sh /usr/local/bin/factory-node-locked-install
COPY entrypoint.sh /usr/local/bin/factory-rufloui-entrypoint
RUN chmod +x /usr/local/bin/factory-rufloui-entrypoint /usr/local/bin/factory-node-locked-install

ENTRYPOINT ["factory-rufloui-entrypoint"]

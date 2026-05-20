ARG NODE_BASE_IMAGE=node:20-slim
FROM ${NODE_BASE_IMAGE}

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git procps \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /ui
COPY entrypoint.sh /usr/local/bin/factory-rufloui-entrypoint
RUN chmod +x /usr/local/bin/factory-rufloui-entrypoint

ENTRYPOINT ["factory-rufloui-entrypoint"]


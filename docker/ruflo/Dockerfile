ARG NODE_BASE_IMAGE=node:20-slim
FROM ${NODE_BASE_IMAGE}

ARG RUFLO_VERSION=3.7.0-alpha.44

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git procps \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "ruflo@${RUFLO_VERSION}"

WORKDIR /app
COPY entrypoint.sh /usr/local/bin/factory-ruflo-entrypoint
RUN chmod +x /usr/local/bin/factory-ruflo-entrypoint

ENTRYPOINT ["factory-ruflo-entrypoint"]


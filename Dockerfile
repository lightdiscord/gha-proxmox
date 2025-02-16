FROM node:23-alpine

RUN apk add --no-cache dumb-init

ARG NODE_ENV=production

USER node
WORKDIR /app

COPY --link ./package.json ./package-lock.json .
RUN --mount=type=cache,target=/tmp/.npm npm ci --omit=dev && rm -rf /home/node/.npm /tmp/node-compile-cache

COPY . .

ENV USER_DATA_FILE=/app/templates/user-data

ENTRYPOINT ["/usr/bin/dumb-init", "node", "src/index.js"]
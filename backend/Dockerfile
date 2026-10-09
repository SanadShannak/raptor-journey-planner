# The machine that runs the API.
#
# Built from the REPO ROOT, not from this folder, because the dependencies it
# installs are declared in the root package.json:
#
#     docker build -f backend/Dockerfile -t raptor-backend .
#
# It needs two things handed to it at run time, and will not start without
# them:
#
#   ACTIVE_NETWORK, MONGO_URI, JWT_SECRET_KEY, JWT_EXPIRES_IN
#       Configuration and secrets. Never baked in -- ENV values are visible to
#       anyone who can pull the image, and the same image is meant to run
#       against a test database or the real one depending on what it is told.
#
#   the compiled feed, mounted at /processed-data/<network>-processed-data
#       memoryCache.js resolves that folder from its OWN location, not from the
#       working directory. It lands at /app/memoryCache.js below, so "../" is
#       the filesystem root -- hence the path. 475 MB is not baked in: data and
#       code change on different schedules, and a layer that size would be
#       re-uploaded for every one-line fix.
FROM node:22.23.3-slim

WORKDIR /app


COPY package*.json ./


RUN npm ci --omit=dev


COPY ./backend .

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=1024"


USER node


EXPOSE 3000


HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]

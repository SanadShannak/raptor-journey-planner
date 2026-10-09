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

# Dependencies first, and only the files that declare them. Docker reuses a
# cached layer until that step's inputs change, so installing before the source
# is copied means editing a route does not reinstall every package.
COPY package*.json ./

# `ci` installs exactly what the lock file pins rather than re-resolving
# versions, so this image builds the same way in six months.
RUN npm ci --omit=dev

# The server. Its contents land directly in /app, so src/index.js is the entry
# point and the data path above follows from that choice.
COPY ./backend .

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=1024"

# Containers run as root unless told otherwise, which makes any flaw in the app
# a flaw with full privileges. The official image ships an unprivileged user,
# and nothing here needs to write to its own files.
USER node

# Documentation rather than a firewall rule: it records the port the app
# listens on. Whether it reaches the outside world is decided when it runs.
EXPOSE 3000

# Ask the app whether it works, rather than assuming a live process means a
# healthy server. `fetch` is built into Node 22, so this needs no curl in the
# image. The start period is generous because the whole timetable is read into
# memory before the port opens.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node directly, not `npm start`. That script passes --env-file-if-exists=.env
# and there is no .env here by design; npm would also sit between Docker and
# the server, swallowing the signals that ask it to shut down cleanly.
CMD ["node", "src/index.js"]

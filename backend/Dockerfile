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


CMD ["node", "src/index.js"]

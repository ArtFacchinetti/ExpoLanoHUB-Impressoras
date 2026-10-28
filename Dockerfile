FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma7.config.ts ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run db:generate
RUN npm test

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

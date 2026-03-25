FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY dist/ dist/

EXPOSE 3004

CMD ["node", "dist/server.js"]

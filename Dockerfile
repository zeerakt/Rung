FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY index.html README.md ./
COPY src ./src
COPY server ./server
COPY docs ./docs
COPY tests ./tests
EXPOSE 8080
ENV PORT=8080
ENV HOST=0.0.0.0
CMD ["node", "server/multiplayerServer.mjs"]

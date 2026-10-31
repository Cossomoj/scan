FROM node:24-alpine
RUN apk add --no-cache libreoffice-writer libreoffice-calc font-dejavu font-liberation
WORKDIR /app
COPY server.mjs ./server.mjs
USER node
EXPOSE 3001
CMD ["node", "server.mjs"]

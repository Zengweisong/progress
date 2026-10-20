FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 DATA_DIR=/app/data
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node server.mjs package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4173
VOLUME /app/data
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

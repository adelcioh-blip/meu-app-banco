FROM node:22-alpine

WORKDIR /app

# Dependências do backend
COPY package*.json ./
RUN npm ci --omit=dev

# Build do frontend
COPY client/package*.json ./client/
RUN npm ci --prefix client

COPY client/ ./client/
RUN npm run build --prefix client

# Código do servidor
COPY src/     ./src/
COPY scripts/ ./scripts/

# Porta padrão Fly.io
ENV PORT=3000
# Dados persistidos no volume montado em /data
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "src/api/server.js"]

'use strict';

// Carrega .env em desenvolvimento (sem efeito em produção se a variável já existir)
require('dotenv').config();

const express = require('express');
const path    = require('node:path');
const fs      = require('node:fs');
const { initDb } = require('../db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API
app.use('/api/licitacoes', require('./routes/licitacoes'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Frontend estático (produção — após npm run build no client/)
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Catch-all para React Router (SPA)
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

async function start() {
  await initDb();

  const server = app.listen(PORT, () => {
    console.log(`Radar de Licitações rodando em http://localhost:${PORT}`);
  });
  server.timeout = 300_000;
}

start().catch(err => { console.error('Falha ao iniciar:', err.message); process.exit(1); });

module.exports = app;

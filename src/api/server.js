'use strict';

const express = require('express');
const { getDb } = require('../db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Inicializa o banco na subida do servidor
getDb();

// Rotas
app.use('/api/licitacoes', require('./routes/licitacoes'));

// Saúde
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// 404 para rotas desconhecidas
app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Timeout de 120s para varreduras síncronas
const server = app.listen(PORT, () => {
  console.log(`Radar de Licitações rodando em http://localhost:${PORT}`);
  console.log('Endpoints disponíveis:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/licitacoes');
  console.log('  GET  /api/licitacoes/:id');
  console.log('  GET  /api/licitacoes/meta/stats');
  console.log('  GET  /api/licitacoes/meta/varreduras');
  console.log('  POST /api/licitacoes/varredura');
});

server.timeout = 300_000; // varredura com 7 modalidades + delays leva ~2-3min

module.exports = app;

'use strict';

const express = require('express');
const router  = express.Router();

const db      = require('../../db/database');
const pncp    = require('../../ingestion/pncp_client');

// ── GET /api/licitacoes ───────────────────────────────────────────────────────
// Parâmetros: uf, classificacao, grupo, dataIni, dataFim, valorMin, q, limit, offset
router.get('/', (req, res) => {
  try {
    const { uf, classificacao, grupo, dataIni, dataFim, q } = req.query;
    const valorMin = Number(req.query.valorMin) || 0;
    const limit    = Math.min(Number(req.query.limit)  || 50, 200);
    const offset   = Number(req.query.offset) || 0;

    const rows = db.buscar({ uf, classificacao, grupo, dataIni, dataFim, valorMin, q, limit, offset });
    res.json({ total: rows.length, limit, offset, data: rows });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── GET /api/licitacoes/:id ───────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const row = db.buscarPorId(Number(req.params.id));
    if (!row) return res.status(404).json({ erro: 'Não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
router.get('/meta/stats', (req, res) => {
  try {
    res.json(db.stats());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── GET /api/varreduras ───────────────────────────────────────────────────────
router.get('/meta/varreduras', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(db.listarVarreduras(limit));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── POST /api/varredura ───────────────────────────────────────────────────────
// Dispara coleta síncrona (bloqueia até terminar, max ~120s)
// Body: { modo, uf, dataIni, dataFim, query, status, maxPaginas, tamPagina }
router.post('/varredura', async (req, res) => {
  const {
    modo = 'estruturado',
    uf,
    dataIni,
    dataFim,
    query,
    status,
    maxPaginas = 10,
    tamPagina  = 50,
  } = req.body || {};

  // Validação mínima para o modo estruturado
  if (modo === 'estruturado' && (!dataIni || !dataFim)) {
    return res.status(400).json({ erro: 'dataIni e dataFim são obrigatórios no modo estruturado (formato YYYYMMDD)' });
  }
  if (modo === 'fulltext' && !query) {
    return res.status(400).json({ erro: 'query é obrigatório no modo fulltext' });
  }

  try {
    let resultado;

    if (modo === 'estruturado') {
      resultado = await pncp.varrerEstruturado({ dataIni, dataFim, uf, maxPaginas, tamPagina, status });
    } else {
      // Modo fulltext — exploratório, sem filtro de relevância garantido
      resultado = await pncp.varrerFulltext({ query, status, uf, dataIni, dataFim, maxPaginas, tamPagina });
    }

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;

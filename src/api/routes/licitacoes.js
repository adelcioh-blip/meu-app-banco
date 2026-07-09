'use strict';

const express = require('express');
const router  = express.Router();

const db   = require('../../db/database');
const pncp = require('../../ingestion/pncp_client');

// ── GET /api/licitacoes ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { uf, classificacao, grupo, dataIni, dataFim, q } = req.query;
    const valorMin = Number(req.query.valorMin) || 0;
    const limit    = Math.min(Number(req.query.limit)  || 50, 200);
    const offset   = Number(req.query.offset) || 0;

    const rows = await db.buscar({ uf, classificacao, grupo, dataIni, dataFim, valorMin, q, limit, offset });
    res.json({ total: rows.length, limit, offset, data: rows });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── GET /api/licitacoes/meta/stats ────────────────────────────────────────────
router.get('/meta/stats', async (req, res) => {
  try {
    res.json(await db.stats());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── GET /api/licitacoes/meta/varreduras ───────────────────────────────────────
router.get('/meta/varreduras', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(await db.listarVarreduras(limit));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── GET /api/licitacoes/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await db.buscarPorId(Number(req.params.id));
    if (!row) return res.status(404).json({ erro: 'Não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ── POST /api/licitacoes/varredura ────────────────────────────────────────────
router.post('/varredura', async (req, res) => {
  const {
    modo       = 'estruturado',
    uf,
    dataIni,
    dataFim,
    query,
    status,
    maxPaginas = 10,
    tamPagina  = 50,
  } = req.body || {};

  if (modo === 'estruturado' && (!dataIni || !dataFim)) {
    return res.status(400).json({ erro: 'dataIni e dataFim são obrigatórios no modo estruturado (formato YYYYMMDD)' });
  }
  if (modo === 'fulltext' && !query) {
    return res.status(400).json({ erro: 'query é obrigatório no modo fulltext' });
  }

  try {
    const resultado = modo === 'estruturado'
      ? await pncp.varrerEstruturado({ dataIni, dataFim, uf, maxPaginas, tamPagina, status })
      : await pncp.varrerFulltext({ query, status, uf, dataIni, dataFim, maxPaginas, tamPagina });

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;

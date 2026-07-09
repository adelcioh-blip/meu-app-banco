'use strict';

const { Pool } = require('pg');
const fs   = require('node:fs');
const path = require('node:path');

const SQL_PATH = path.join(__dirname, 'schema.sql');

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida');
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  });
  return _pool;
}

async function initDb() {
  const schema = fs.readFileSync(SQL_PATH, 'utf8');
  await getPool().query(schema);
}

// ── Licitações ────────────────────────────────────────────────────────────────

async function upsertLicitacao(item) {
  const res = await getPool().query(`
    INSERT INTO licitacoes
      (cnpj_orgao, ano, sequencial, orgao_nome, municipio, uf,
       objeto, modalidade, situacao,
       data_publicacao, data_inicio, data_fim, valor_global, link,
       grupo_match, dam_exclusivo, formas_emissao, classificacao, justificativa)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (cnpj_orgao, ano, sequencial) DO NOTHING
  `, [
    item.cnpj_orgao     ?? null,
    item.ano            ?? null,
    item.sequencial     ?? null,
    item.orgao_nome     ?? null,
    item.municipio      ?? null,
    item.uf             ?? null,
    item.objeto         ?? null,
    item.modalidade     ?? null,
    item.situacao       ?? null,
    item.data_publicacao?? null,
    item.data_inicio    ?? null,
    item.data_fim       ?? null,
    item.valor_global   ?? null,
    item.link           ?? null,
    item.grupo_match    ?? null,
    item.dam_exclusivo  ?? null,
    item.formas_emissao ?? null,
    item.classificacao  ?? null,
    item.justificativa  ?? null,
  ]);
  return { inserted: res.rowCount === 1 };
}

async function buscar({ uf, classificacao, grupo, dataIni, dataFim, valorMin, q, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (uf)            { where.push(`uf = $${i++}`);               params.push(uf.toUpperCase()); }
  if (classificacao) { where.push(`classificacao = $${i++}`);    params.push(classificacao); }
  if (grupo)         { where.push(`grupo_match = $${i++}`);      params.push(grupo); }
  if (dataIni)       { where.push(`data_publicacao >= $${i++}`); params.push(dataIni); }
  if (dataFim)       { where.push(`data_publicacao <= $${i++}`); params.push(dataFim); }
  if (valorMin > 0)  { where.push(`valor_global >= $${i++}`);    params.push(valorMin); }
  if (q)             { where.push(`objeto ILIKE $${i++}`);       params.push(`%${q}%`); }

  const cond   = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limIdx = i++;
  const offIdx = i++;
  params.push(limit, offset);

  const sql = `SELECT * FROM licitacoes ${cond} ORDER BY data_publicacao DESC LIMIT $${limIdx} OFFSET $${offIdx}`;
  const res = await getPool().query(sql, params);
  return res.rows;
}

async function buscarPorId(id) {
  const res = await getPool().query('SELECT * FROM licitacoes WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function stats() {
  const pool = getPool();

  const totRow = (await pool.query(`
    SELECT
      COUNT(*)::INTEGER                                                          AS total,
      SUM(CASE WHEN classificacao = 'GREEN'   THEN 1 ELSE 0 END)::INTEGER AS green,
      SUM(CASE WHEN classificacao = 'RED'     THEN 1 ELSE 0 END)::INTEGER AS red,
      SUM(CASE WHEN classificacao = 'REVISAR' THEN 1 ELSE 0 END)::INTEGER AS revisar,
      SUM(CASE WHEN classificacao IS NULL     THEN 1 ELSE 0 END)::INTEGER AS sem_classificacao,
      SUM(CASE WHEN grupo_match = 'A'         THEN 1 ELSE 0 END)::INTEGER AS grupo_a,
      SUM(CASE WHEN grupo_match = 'B'         THEN 1 ELSE 0 END)::INTEGER AS grupo_b
    FROM licitacoes
  `)).rows[0];

  const por_uf = (await pool.query(`
    SELECT uf, COUNT(*)::INTEGER AS total
    FROM licitacoes
    WHERE uf IS NOT NULL
    GROUP BY uf
    ORDER BY total DESC
    LIMIT 30
  `)).rows;

  return { totais: totRow, por_uf };
}

// ── Varreduras ────────────────────────────────────────────────────────────────

async function salvarVarredura(log) {
  const res = await getPool().query(`
    INSERT INTO varreduras
      (modo, uf, data_ini, data_fim, query_fulltext,
       total_api, total_relevantes, total_inseridas, total_duplicatas, erros)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id
  `, [
    log.modo             ?? null,
    log.uf               ?? null,
    log.data_ini         ?? null,
    log.data_fim         ?? null,
    log.query_fulltext   ?? null,
    log.total_api        ?? 0,
    log.total_relevantes ?? 0,
    log.total_inseridas  ?? 0,
    log.total_duplicatas ?? 0,
    JSON.stringify(log.erros || []),
  ]);
  return res.rows[0].id;
}

async function listarVarreduras(limit = 20) {
  const res = await getPool().query(
    'SELECT * FROM varreduras ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

module.exports = { getPool, initDb, upsertLicitacao, buscar, buscarPorId, stats, salvarVarredura, listarVarreduras };

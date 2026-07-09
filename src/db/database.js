'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs   = require('node:fs');

// Em produção (Fly.io) o volume é montado em /data; em dev usa ./data local
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'licitacoes.db');
const SQL_PATH = path.join(__dirname, 'schema.sql');

let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec(fs.readFileSync(SQL_PATH, 'utf8'));
  return _db;
}

// Compatível com chamadas async (await em função síncrona é no-op)
async function initDb() { getDb(); }

// ── Licitações ────────────────────────────────────────────────────────────────

async function upsertLicitacao(item) {
  const db   = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO licitacoes
      (cnpj_orgao, ano, sequencial, orgao_nome, municipio, uf,
       objeto, modalidade, situacao,
       data_publicacao, data_inicio, data_fim, valor_global, link,
       grupo_match, dam_exclusivo, formas_emissao, classificacao, justificativa)
    VALUES
      ($cnpj_orgao,$ano,$sequencial,$orgao_nome,$municipio,$uf,
       $objeto,$modalidade,$situacao,
       $data_publicacao,$data_inicio,$data_fim,$valor_global,$link,
       $grupo_match,$dam_exclusivo,$formas_emissao,$classificacao,$justificativa)
  `);
  const info = stmt.run({
    $cnpj_orgao:      item.cnpj_orgao      ?? null,
    $ano:             item.ano             ?? null,
    $sequencial:      item.sequencial      ?? null,
    $orgao_nome:      item.orgao_nome      ?? null,
    $municipio:       item.municipio       ?? null,
    $uf:              item.uf              ?? null,
    $objeto:          item.objeto          ?? null,
    $modalidade:      item.modalidade      ?? null,
    $situacao:        item.situacao        ?? null,
    $data_publicacao: item.data_publicacao ?? null,
    $data_inicio:     item.data_inicio     ?? null,
    $data_fim:        item.data_fim        ?? null,
    $valor_global:    item.valor_global    ?? null,
    $link:            item.link            ?? null,
    $grupo_match:     item.grupo_match     ?? null,
    $dam_exclusivo:   item.dam_exclusivo   ?? null,
    $formas_emissao:  item.formas_emissao  ?? null,
    $classificacao:   item.classificacao   ?? null,
    $justificativa:   item.justificativa   ?? null,
  });
  return { inserted: info.changes === 1 };
}

async function buscar({ uf, classificacao, grupo, dataIni, dataFim, valorMin, q, limit = 50, offset = 0 } = {}) {
  const db     = getDb();
  const where  = [];
  const params = {};

  if (uf)            { where.push('uf = $uf');                          params.$uf = uf.toUpperCase(); }
  if (classificacao) { where.push('classificacao = $classificacao');    params.$classificacao = classificacao; }
  if (grupo)         { where.push('grupo_match = $grupo');              params.$grupo = grupo; }
  if (dataIni)       { where.push('data_publicacao >= $dataIni');       params.$dataIni = dataIni; }
  if (dataFim)       { where.push('data_publicacao <= $dataFim');       params.$dataFim = dataFim; }
  if (valorMin > 0)  { where.push('valor_global >= $valorMin');         params.$valorMin = valorMin; }
  if (q)             { where.push('objeto LIKE $q');                    params.$q = `%${q}%`; }

  const cond = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db.prepare(
    `SELECT * FROM licitacoes ${cond} ORDER BY data_publicacao DESC LIMIT $limit OFFSET $offset`
  ).all({ ...params, $limit: limit, $offset: offset });
}

async function buscarPorId(id) {
  return getDb().prepare('SELECT * FROM licitacoes WHERE id = $id').get({ $id: id }) || null;
}

async function stats() {
  const db = getDb();
  const totais = db.prepare(`
    SELECT
      COUNT(*)                                                          AS total,
      SUM(CASE WHEN classificacao = 'GREEN'   THEN 1 ELSE 0 END) AS green,
      SUM(CASE WHEN classificacao = 'RED'     THEN 1 ELSE 0 END) AS red,
      SUM(CASE WHEN classificacao = 'REVISAR' THEN 1 ELSE 0 END) AS revisar,
      SUM(CASE WHEN classificacao IS NULL     THEN 1 ELSE 0 END) AS sem_classificacao,
      SUM(CASE WHEN grupo_match = 'A'         THEN 1 ELSE 0 END) AS grupo_a,
      SUM(CASE WHEN grupo_match = 'B'         THEN 1 ELSE 0 END) AS grupo_b
    FROM licitacoes
  `).get({});
  const por_uf = db.prepare(`
    SELECT uf, COUNT(*) AS total FROM licitacoes
    WHERE uf IS NOT NULL GROUP BY uf ORDER BY total DESC LIMIT 30
  `).all({});
  return { totais, por_uf };
}

// ── Varreduras ────────────────────────────────────────────────────────────────

async function salvarVarredura(log) {
  const info = getDb().prepare(`
    INSERT INTO varreduras
      (modo, uf, data_ini, data_fim, query_fulltext,
       total_api, total_relevantes, total_inseridas, total_duplicatas, erros)
    VALUES ($modo,$uf,$data_ini,$data_fim,$query_fulltext,
            $total_api,$total_relevantes,$total_inseridas,$total_duplicatas,$erros)
  `).run({
    $modo:             log.modo             ?? null,
    $uf:               log.uf               ?? null,
    $data_ini:         log.data_ini         ?? null,
    $data_fim:         log.data_fim         ?? null,
    $query_fulltext:   log.query_fulltext   ?? null,
    $total_api:        log.total_api        ?? 0,
    $total_relevantes: log.total_relevantes ?? 0,
    $total_inseridas:  log.total_inseridas  ?? 0,
    $total_duplicatas: log.total_duplicatas ?? 0,
    $erros:            JSON.stringify(log.erros || []),
  });
  return info.lastInsertRowid;
}

async function listarVarreduras(limit = 20) {
  return getDb().prepare(
    'SELECT * FROM varreduras ORDER BY created_at DESC LIMIT $limit'
  ).all({ $limit: limit });
}

module.exports = { getDb, initDb, upsertLicitacao, buscar, buscarPorId, stats, salvarVarredura, listarVarreduras };

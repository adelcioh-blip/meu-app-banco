-- Schema SQLite (Fly.io com volume persistente em /data)

CREATE TABLE IF NOT EXISTS licitacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj_orgao     TEXT    NOT NULL,
  ano            INTEGER,
  sequencial     INTEGER,
  orgao_nome     TEXT,
  municipio      TEXT,
  uf             TEXT,
  objeto         TEXT,
  modalidade     TEXT,
  situacao       TEXT,
  data_publicacao TEXT,
  data_inicio    TEXT,
  data_fim       TEXT,
  valor_global   REAL,
  link           TEXT,
  grupo_match    TEXT,
  dam_exclusivo  INTEGER,
  formas_emissao TEXT,
  classificacao  TEXT,
  justificativa  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (cnpj_orgao, ano, sequencial)
);

CREATE TABLE IF NOT EXISTS varreduras (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  modo             TEXT,
  uf               TEXT,
  data_ini         TEXT,
  data_fim         TEXT,
  query_fulltext   TEXT,
  total_api        INTEGER DEFAULT 0,
  total_relevantes INTEGER DEFAULT 0,
  total_inseridas  INTEGER DEFAULT 0,
  total_duplicatas INTEGER DEFAULT 0,
  erros            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_lic_uf         ON licitacoes(uf);
CREATE INDEX IF NOT EXISTS idx_lic_classif    ON licitacoes(classificacao);
CREATE INDEX IF NOT EXISTS idx_lic_grupo      ON licitacoes(grupo_match);
CREATE INDEX IF NOT EXISTS idx_lic_pub        ON licitacoes(data_publicacao);
CREATE INDEX IF NOT EXISTS idx_lic_uf_classif ON licitacoes(uf, classificacao);

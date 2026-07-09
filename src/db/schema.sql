-- Schema PostgreSQL

CREATE TABLE IF NOT EXISTS licitacoes (
  id               BIGSERIAL PRIMARY KEY,
  cnpj_orgao       TEXT    NOT NULL,
  ano              INTEGER,
  sequencial       INTEGER,
  orgao_nome       TEXT,
  municipio        TEXT,
  uf               TEXT,
  objeto           TEXT,
  modalidade       TEXT,
  situacao         TEXT,
  data_publicacao  TEXT,
  data_inicio      TEXT,
  data_fim         TEXT,
  valor_global     NUMERIC,
  link             TEXT,
  grupo_match      TEXT,
  dam_exclusivo    SMALLINT,
  formas_emissao   TEXT,
  classificacao    TEXT,
  justificativa    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cnpj_orgao, ano, sequencial)
);

CREATE TABLE IF NOT EXISTS varreduras (
  id               BIGSERIAL PRIMARY KEY,
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
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lic_uf         ON licitacoes(uf);
CREATE INDEX IF NOT EXISTS idx_lic_classif    ON licitacoes(classificacao);
CREATE INDEX IF NOT EXISTS idx_lic_grupo      ON licitacoes(grupo_match);
CREATE INDEX IF NOT EXISTS idx_lic_pub        ON licitacoes(data_publicacao);
CREATE INDEX IF NOT EXISTS idx_lic_uf_classif ON licitacoes(uf, classificacao);

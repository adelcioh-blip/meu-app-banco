-- Schema compatível com Postgres (troca só o driver quando migrar para cloud)

CREATE TABLE IF NOT EXISTS licitacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Chave natural de deduplicação
  cnpj_orgao     TEXT    NOT NULL,
  ano            INTEGER NOT NULL,
  sequencial     INTEGER NOT NULL,

  -- Dados do órgão / localização
  orgao_nome     TEXT,
  municipio      TEXT,
  uf             TEXT,

  -- Dados do edital
  objeto         TEXT,     -- texto completo, sem truncamento
  modalidade     TEXT,
  situacao       TEXT,
  data_publicacao TEXT,    -- YYYY-MM-DD
  data_inicio    TEXT,
  data_fim       TEXT,
  valor_global   REAL,
  link           TEXT,

  -- Classificação (Nível 1 — keyword; Nível 2 — IA, deferido)
  grupo_match    TEXT,     -- 'A' | 'B' | NULL
  dam_exclusivo  INTEGER,  -- 1=sim 0=nao NULL=nao_avaliado
  formas_emissao TEXT,     -- JSON array ex: '["DAM","PIX","boleto"]'
  classificacao  TEXT,     -- 'GREEN' | 'RED' | 'REVISAR' | NULL
  justificativa  TEXT,

  -- Controle
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  UNIQUE (cnpj_orgao, ano, sequencial)
);

CREATE INDEX IF NOT EXISTS idx_licitacoes_uf            ON licitacoes (uf);
CREATE INDEX IF NOT EXISTS idx_licitacoes_classificacao ON licitacoes (classificacao);
CREATE INDEX IF NOT EXISTS idx_licitacoes_grupo         ON licitacoes (grupo_match);
CREATE INDEX IF NOT EXISTS idx_licitacoes_data          ON licitacoes (data_publicacao);
CREATE INDEX IF NOT EXISTS idx_licitacoes_uf_class      ON licitacoes (uf, classificacao);

-- Log de cada execução de coleta
CREATE TABLE IF NOT EXISTS varreduras (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  modo             TEXT,     -- 'estruturado' | 'fulltext'
  uf               TEXT,
  data_ini         TEXT,
  data_fim         TEXT,
  query_fulltext   TEXT,     -- preenchido apenas no modo fulltext
  total_api        INTEGER,  -- total retornado pelo PNCP antes dos filtros
  total_relevantes INTEGER,  -- após filtro A/B
  total_inseridas  INTEGER,  -- novas no banco (deduplicação)
  total_duplicatas INTEGER,
  erros            TEXT,     -- JSON array de strings
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

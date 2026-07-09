'use strict';

const PNCP_BASE = 'https://pncp.gov.br';

// ── Normaliza item da API /consulta ───────────────────────────────────────────
function _normConsulta(raw) {
  const orgao   = raw.orgaoEntidade   || {};
  const unidade = raw.unidadeOrgao    || {};
  const cnpj    = orgao.cnpj          || '';
  const ano     = raw.anoCompra       || raw.ano || '';
  const seq     = raw.sequencialCompra || raw.numeroSequencial || raw.numero_sequencial || '';

  const pub = (raw.dataPublicacaoPncp    || raw.data_publicacao_pncp || '').slice(0, 10);
  const ini = (raw.dataAberturaProposta  || raw.data_inicio_vigencia  || '').slice(0, 10);
  const fim = (raw.dataEncerramentoProposta || raw.dataEncerramentoOferta || raw.data_fim_vigencia || '').slice(0, 10);

  const link = cnpj && ano && seq
    ? `${PNCP_BASE}/app/editais/${cnpj}/${ano}/${seq}`
    : PNCP_BASE;

  return {
    cnpj_orgao:     cnpj,
    ano:            Number(ano) || null,
    sequencial:     Number(seq) || null,
    orgao_nome:     orgao.razaoSocial    || raw.orgao_nome    || null,
    municipio:      unidade.municipioNome || raw.municipio_nome || null,
    uf:             unidade.ufSigla       || raw.uf             || null,
    objeto:         raw.objetoCompra      || raw.description    || null,
    modalidade:     raw.modalidadeNome    || raw.modalidade_licitacao_nome || null,
    situacao:       raw.situacaoCompraNome || raw.situacaoNome || raw.situacao_nome || null,
    data_publicacao: pub || null,
    data_inicio:     ini || null,
    data_fim:        fim || null,
    valor_global:   raw.valorTotalEstimado ?? raw.valor_global ?? null,
    link,
  };
}

// ── Normaliza item da API /search ─────────────────────────────────────────────
function _normSearch(raw) {
  const cnpj = raw.orgao_cnpj || '';
  const ano  = raw.ano        || '';
  const seq  = raw.numero_sequencial || '';

  let link = PNCP_BASE;
  if (raw.item_url) {
    link = PNCP_BASE + raw.item_url.replace('/compras/', '/app/editais/');
  } else if (cnpj && ano && seq) {
    link = `${PNCP_BASE}/app/editais/${cnpj}/${ano}/${seq}`;
  }

  return {
    cnpj_orgao:     cnpj,
    ano:            Number(ano)  || null,
    sequencial:     Number(seq)  || null,
    orgao_nome:     raw.orgao_nome    || null,
    municipio:      raw.municipio_nome || null,
    uf:             raw.uf             || null,
    objeto:         raw.description    || null,
    modalidade:     raw.modalidade_licitacao_nome || null,
    situacao:       raw.situacao_nome  || null,
    data_publicacao: (raw.data_publicacao_pncp || '').slice(0, 10) || null,
    data_inicio:    (raw.data_inicio_vigencia   || '').slice(0, 10) || null,
    data_fim:       (raw.data_fim_vigencia       || '').slice(0, 10) || null,
    valor_global:   raw.valor_global ?? null,
    link,
  };
}

// Detecta qual formato veio e aplica o normalizador correto
function normalizar(raw) {
  if (raw.orgaoEntidade !== undefined || raw.anoCompra !== undefined) {
    return _normConsulta(raw);
  }
  return _normSearch(raw);
}

module.exports = { normalizar };

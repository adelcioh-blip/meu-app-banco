'use strict';

const https = require('node:https');
const zlib  = require('node:zlib');

const { normalizar }           = require('./normalizer');
const { matchGrupo, classificarNivel1, score } = require('../filter/relevance');
const { upsertLicitacao, salvarVarredura }     = require('../db/database');

// ── SSL ───────────────────────────────────────────────────────────────────────
const _agent = new https.Agent({ rejectUnauthorized: false });

// ── Headers realistas (evita errno 104 no /api/consulta) ─────────────────────
const _HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate',
  'Referer':         'https://pncp.gov.br/app/editais',
  'Origin':          'https://pncp.gov.br',
  'Connection':      'keep-alive',
  'Sec-Fetch-Dest':  'empty',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Site':  'same-origin',
};

const CONSULTA_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';
const SEARCH_URL   = 'https://pncp.gov.br/api/search/';

// Modalidades mais relevantes para o radar (codigoModalidadeContratacao tornou-se obrigatório)
// 4=Concorrência Eletrônica, 5=Concorrência Presencial, 6=Pregão Eletrônico, 7=Pregão Presencial,
// 8=Dispensa, 9=Inexigibilidade, 12=Credenciamento
const MODALIDADES_PADRAO = [4, 5, 6, 7, 8, 9, 12];

// ── HTTP com retry e backoff exponencial ──────────────────────────────────────
function httpGet(url, retries = 4, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    let attempt = 0;

    function tryRequest() {
      attempt++;
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path:     parsedUrl.pathname + parsedUrl.search,
        method:   'GET',
        headers:  _HEADERS,
        agent:    _agent,
        timeout:  timeoutMs,
      };

      const req = https.request(options, (res) => {
        const statusCode = res.statusCode;

        // 4xx → definitivo, sem retry
        if (statusCode >= 400 && statusCode < 500) {
          res.resume();
          return resolve({ _erro: `HTTP ${statusCode}` });
        }

        // 5xx → retry se ainda tiver tentativas
        if (statusCode >= 500) {
          res.resume();
          if (attempt >= retries) return resolve({ _erro: `HTTP ${statusCode}` });
          return setTimeout(tryRequest, 2 ** attempt * 1_000);
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw    = Buffer.concat(chunks);
          const enc    = res.headers['content-encoding'];
          let body;

          try {
            if (enc === 'gzip')    body = zlib.gunzipSync(raw).toString('utf-8');
            else if (enc === 'deflate') body = zlib.inflateSync(raw).toString('utf-8');
            else                   body = raw.toString('utf-8');
          } catch (e) {
            return resolve({ _erro: `Decompress error: ${e.message}` });
          }

          if (!body.trim()) return resolve(null);
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ _erro: `JSON parse: ${e.message}` });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempt >= retries) return resolve({ _erro: `Timeout ${timeoutMs}ms` });
        setTimeout(tryRequest, 2 ** attempt * 1_000);
      });

      req.on('error', (err) => {
        if (attempt >= retries) return resolve({ _erro: err.message });
        setTimeout(tryRequest, 2 ** attempt * 1_000);
      });

      req.end();
    }

    tryRequest();
  });
}

// ── Monta URL com query string ────────────────────────────────────────────────
function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}?${qs}`;
}

// ── Processa um lote de itens brutos ─────────────────────────────────────────
// Filtra por relevância, classifica (Nível 1) e persiste no banco.
// Retorna { relevantes, inseridas, duplicatas }
function processarLote(raws) {
  let relevantes = 0, inseridas = 0, duplicatas = 0;

  for (const raw of raws) {
    const item  = normalizar(raw);
    if (!item.cnpj_orgao || !item.ano || !item.sequencial) continue;

    const objeto = item.objeto || '';
    const grupo  = matchGrupo(objeto);
    if (!grupo) continue;  // não relevante — descarta

    relevantes++;
    const classif = classificarNivel1(objeto, grupo);

    const registro = {
      ...item,
      grupo_match:    grupo,
      dam_exclusivo:  classif.dam_exclusivo,
      formas_emissao: classif.formas_emissao,
      classificacao:  classif.classificacao,
      justificativa:  classif.justificativa,
    };

    const { inserted } = upsertLicitacao(registro);
    if (inserted) inseridas++;
    else duplicatas++;
  }

  return { relevantes, inseridas, duplicatas };
}

// ── Varredura: API estruturada /consulta ──────────────────────────────────────
// codigoModalidadeContratacao tornou-se obrigatório na API — itera por modalidade
async function varrerEstruturado({ dataIni, dataFim, uf, modalidades, maxPaginas = 10, tamPagina = 50, status, onProgress } = {}) {
  const log = {
    modo: 'estruturado', uf: uf || null,
    data_ini: dataIni, data_fim: dataFim, query_fulltext: null,
    total_api: 0, total_relevantes: 0, total_inseridas: 0, total_duplicatas: 0,
    erros: [],
  };

  const mods = (modalidades && modalidades.length) ? modalidades : MODALIDADES_PADRAO;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (let mi = 0; mi < mods.length; mi++) {
    const modalidade = mods[mi];
    if (mi > 0) await sleep(3000); // evita rate limiting (429) entre modalidades

    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      if (pagina > 1) await sleep(500);
      if (onProgress) onProgress({ pagina, maxPaginas, modalidade, modo: 'estruturado' });

      const params = {
        dataInicial: dataIni,
        dataFinal: dataFim,
        codigoModalidadeContratacao: modalidade,
        pagina,
        tamanhoPagina: tamPagina,
      };
      if (uf) params.uf = uf;

      const resp = await httpGet(buildUrl(CONSULTA_URL, params));

      if (!resp)      { break; }
      if (resp._erro) { log.erros.push(`mod${modalidade} pág${pagina}: ${resp._erro}`); break; }

      const raws      = resp.data || resp.items || [];
      const totalPags = resp.totalPaginas || 0;
      if (pagina === 1) log.total_api += resp.totalRegistros || resp.total || 0;

      if (!raws.length) break;

      const filtrados = status === 'recebendo_proposta'
        ? raws.filter(r => /recebendo|aberto|ativo|publicado|vigente/i.test(
            r.situacaoCompraNome || r.situacaoNome || ''))
        : raws;

      const { relevantes, inseridas, duplicatas } = processarLote(filtrados);
      log.total_relevantes += relevantes;
      log.total_inseridas  += inseridas;
      log.total_duplicatas += duplicatas;

      if (totalPags && pagina >= totalPags) break;
      if (raws.length < tamPagina)          break;
    }
  }

  const varreduraId = salvarVarredura(log);
  return { ...log, varreduraId };
}

// ── Varredura: full-text /api/search ─────────────────────────────────────────
// MODO EXPLORATÓRIO — sem garantia de cobertura; sem filtro de relevância local
// (retorna tudo que o PNCP indexar para a query informada)
async function varrerFulltext({ query, status, uf, dataIni, dataFim, maxPaginas = 5, tamPagina = 20, onProgress } = {}) {
  const log = {
    modo: 'fulltext', uf: uf || null,
    data_ini: dataIni || null, data_fim: dataFim || null, query_fulltext: query,
    total_api: 0, total_relevantes: 0, total_inseridas: 0, total_duplicatas: 0,
    erros: [],
  };

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    if (onProgress) onProgress({ pagina, maxPaginas, modo: 'fulltext' });

    const params = { q: query, tipos_documento: 'edital', ordenacao: '-data', pagina, tam_pagina: tamPagina };
    if (status) params.status = status;

    const resp = await httpGet(buildUrl(SEARCH_URL, params));

    if (!resp)      { break; }
    if (resp._erro) { log.erros.push(`pág ${pagina}: ${resp._erro}`); break; }

    const raws    = resp.items || [];
    log.total_api = resp.total || log.total_api;

    if (!raws.length) break;

    // Filtros locais (data e UF — a API /search não os suporta nativamente)
    const filtrados = raws.filter(r => {
      if (uf && (r.uf || '').toUpperCase() !== uf.toUpperCase()) return false;
      const pub = (r.data_publicacao_pncp || '').slice(0, 10);
      if (dataIni && pub && pub < dataIni) return false;
      if (dataFim && pub && pub > dataFim) return false;
      return true;
    });

    const { relevantes, inseridas, duplicatas } = processarLote(filtrados);
    log.total_relevantes += relevantes;
    log.total_inseridas  += inseridas;
    log.total_duplicatas += duplicatas;

    if (raws.length < tamPagina) break;
  }

  const varreduraId = salvarVarredura(log);
  return { ...log, varreduraId };
}

module.exports = { httpGet, buildUrl, varrerEstruturado, varrerFulltext };

'use strict';

// Testa se o endpoint /api/search/ do PNCP aceita sintaxe booleana (OR, parênteses).
// Executa 3 requests e compara totais retornados.
//
// Lógica: se OR funciona como operador,
//   total(A OR B) deve ser ≥ max(total(A), total(B))
// Se OR é tratado como literal,
//   total("arrecadacao OR pix") ≈ 0 (nenhum edital tem essa string literal)

const { httpGet, buildUrl } = require('../src/ingestion/pncp_client');

const SEARCH_URL = 'https://pncp.gov.br/api/search/';
const TAM = 1;

async function testar(label, query) {
  const url  = buildUrl(SEARCH_URL, { q: query, tipos_documento: 'edital', pagina: 1, tam_pagina: TAM });
  const resp = await httpGet(url);
  if (!resp || resp._erro) {
    console.log(`  ${label}: ERRO — ${resp?._erro || 'sem resposta'}`);
    return null;
  }
  const total = resp.total ?? resp.totalRegistros ?? '?';
  console.log(`  ${label}: total=${total}  (query: "${query}")`);
  return typeof total === 'number' ? total : null;
}

(async () => {
  console.log('\nValidando suporte a sintaxe booleana no PNCP /api/search/\n');

  const tA   = await testar('Termo A isolado         ', 'arrecadacao municipal');
  const tB   = await testar('Termo B isolado         ', 'pix');
  const tOR  = await testar('A OR B (booleano)       ', 'arrecadacao municipal OR pix');
  const tLit = await testar('Literal "OR" (como texto)', '"arrecadacao municipal OR pix"');

  console.log('\n── Interpretação ──');

  if (tA === null || tB === null || tOR === null) {
    console.log('Não foi possível concluir — um ou mais requests falharam.');
    return;
  }

  const orFunciona = tOR >= Math.max(tA, tB);

  if (orFunciona) {
    console.log('RESULTADO: PNCP aceita OR como operador booleano.');
    console.log('=> QUERY_PADRAO com OR/parenteses é válida para o modo full-text.');
  } else {
    console.log('RESULTADO: PNCP NÃO aceita OR como booleano — trata como texto literal.');
    console.log('=> Usar termos simples no modo full-text (sem OR/parênteses).');
    console.log('=> O modo estruturado (/api/consulta + filtro A/B local) não é afetado.');
  }

  if (tLit !== null && tLit > 0) {
    console.log(`\nAtenção: busca pelo literal "arrecadacao municipal OR pix" retornou ${tLit} resultado(s).`);
    console.log('Isso confirma que OR NÃO é operador — o portal indexou a frase inteira.');
  }

  console.log('');
})();

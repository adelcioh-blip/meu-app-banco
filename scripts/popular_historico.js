'use strict';

/**
 * Popula o banco com histórico do PNCP via fulltext.
 *
 * Estratégia: o /api/search/ retorna no máximo ~500 resultados por query
 * (paginação limitada pelo servidor). Para aumentar a cobertura, rodamos
 * múltiplas queries com variações dos termos do Grupo A.
 *
 * Uso:
 *   node scripts/popular_historico.js
 *   node scripts/popular_historico.js --paginas 30  (30 págs × 20 itens = 600 por query)
 */

const { varrerFulltext } = require('../src/ingestion/pncp_client');
const { getDb }          = require('../src/db/database');

const QUERIES = [
  'arrecadacao municipal OR boleto bancario OR meios de pagamento OR sistema de arrecadacao',
  'recolhimento de tributos OR cobranca de tributos OR gestao de receitas municipais',
  'credenciamento bancario OR credenciamento de instituicoes financeiras',
  'servicos bancarios arrecadacao OR banco arrecadador',
  'pix arrecadacao municipal OR pagamento via pix tributos',
  'guia de arrecadacao OR convênio de arrecadação OR plataforma de pagamento',
  'gateway de pagamento prefeitura OR processamento de pagamentos municipio',
];

const args    = process.argv.slice(2);
const PAG_IDX = args.indexOf('--paginas');
const MAX_PAG = PAG_IDX !== -1 ? Number(args[PAG_IDX + 1]) || 20 : 20;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Garante que o banco existe
  getDb();

  let totalInseridas = 0, totalDuplicatas = 0, totalRelevantes = 0;
  const t0 = Date.now();

  console.log(`\nPopulando banco histórico — ${QUERIES.length} queries × máx ${MAX_PAG} págs cada\n`);

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    console.log(`[${i + 1}/${QUERIES.length}] "${q.slice(0, 60)}…"`);

    const r = await varrerFulltext({
      query: q,
      maxPaginas: MAX_PAG,
      tamPagina: 20,
      onProgress: ({ pagina, maxPaginas }) => {
        process.stdout.write(`  pag ${pagina}/${maxPaginas}... `);
      },
    });

    console.log(`\n  API: ${r.total_api} | Relevantes: ${r.total_relevantes} | Inseridas: ${r.total_inseridas} | Dup: ${r.total_duplicatas}`);
    if (r.erros.length) console.log('  Erros:', r.erros.join(', '));

    totalRelevantes += r.total_relevantes;
    totalInseridas  += r.total_inseridas;
    totalDuplicatas += r.total_duplicatas;

    // Pausa entre queries para não estressar a API
    if (i < QUERIES.length - 1) {
      process.stdout.write('  aguardando 3s...\n');
      await sleep(3000);
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Concluído em ${secs}s`);
  console.log(`Relevantes totais : ${totalRelevantes}`);
  console.log(`Inseridas no banco : ${totalInseridas}`);
  console.log(`Duplicatas ignoradas: ${totalDuplicatas}`);
  console.log(`═══════════════════════════════════════\n`);

  process.exit(0);
})();

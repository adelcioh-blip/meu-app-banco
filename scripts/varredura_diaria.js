'use strict';

/**
 * Varredura diária — executar via Task Scheduler (Windows) ou cron (Linux/Mac).
 *
 * O que faz:
 *   - Roda todas as queries do Grupo A via fulltext (rápido, ~30s total)
 *   - Registra resultado no banco (tabela varreduras)
 *   - Imprime resumo para log do agendador
 *
 * Configurar no Windows:
 *   schtasks /create /tn "RadarLicitacoes" /tr "node C:\caminho\scripts\varredura_diaria.js" /sc daily /st 07:00
 *
 * Configurar no Linux/Mac (crontab -e):
 *   0 7 * * * /usr/bin/node /caminho/scripts/varredura_diaria.js >> /var/log/radar.log 2>&1
 */

const { varrerFulltext } = require('../src/ingestion/pncp_client');
const { getDb }          = require('../src/db/database');

const QUERIES = [
  'arrecadacao municipal OR boleto bancario OR meios de pagamento OR sistema de arrecadacao',
  'recolhimento de tributos OR cobranca de tributos OR gestao de receitas municipais',
  'credenciamento bancario OR credenciamento de instituicoes financeiras',
  'servicos bancarios arrecadacao OR banco arrecadador',
  'pix arrecadacao municipal OR pagamento via pix tributos',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function ts() { return new Date().toISOString(); }

(async () => {
  getDb();
  const t0 = Date.now();

  console.log(`[${ts()}] Varredura diária iniciada — ${QUERIES.length} queries`);

  let totalInseridas = 0, totalRelevantes = 0, erros = [];

  for (let i = 0; i < QUERIES.length; i++) {
    try {
      const r = await varrerFulltext({
        query:     QUERIES[i],
        maxPaginas: 10,
        tamPagina:  20,
      });

      totalRelevantes += r.total_relevantes;
      totalInseridas  += r.total_inseridas;
      if (r.erros.length) erros.push(...r.erros);

      console.log(`[${ts()}] Query ${i + 1}/${QUERIES.length}: API=${r.total_api} relevantes=${r.total_relevantes} inseridas=${r.total_inseridas}`);
    } catch (e) {
      erros.push(`query ${i + 1}: ${e.message}`);
      console.error(`[${ts()}] Query ${i + 1} falhou: ${e.message}`);
    }

    if (i < QUERIES.length - 1) await sleep(3000);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${ts()}] Concluído em ${secs}s | relevantes=${totalRelevantes} inseridas=${totalInseridas} erros=${erros.length}`);

  process.exit(0);
})();

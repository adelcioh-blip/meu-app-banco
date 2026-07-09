'use strict';

// ── Grupo A — núcleo forte (arrecadação / meios de pagamento) ─────────────────
// Qualquer match → edital entra no pipeline; classificador DAM nível 1 decide GREEN/REVISAR
const GRUPO_A = [
  'emissão de boleto',
  'boletos bancários',
  'arrecadação municipal',
  'guia de arrecadação',
  'convênio de arrecadação',
  'meios de pagamento',
  'pagamento via pix',
  'processamento de pagamentos',
  'gateway de pagamento',
  'sistema de arrecadação',
  'instituição arrecadadora',
  'banco arrecadador',
  'cobrança de tributos',
  'recolhimento de tributos',
  'gestão de receitas municipais',
  'plataforma de pagamento',
];

// ── Grupo B — tributários/correlatos ─────────────────────────────────────────
// Qualquer match → classificacao = REVISAR automático (não roda classificador DAM)
//
// Acrônimos curtos (ISS, IPTU, ITBI) usam regex com word boundary em relevance.js
// para não casar como substring (ex: "iss" bateria em "emissão", "comissão" etc.)
const GRUPO_B_REGEX = [/\biptu\b/, /\biss\b/, /\bitbi\b/];

// Frases mais longas — substring match seguro após normalização
const GRUPO_B_FRASES = [
  'servicos bancarios',
  'serviços bancários',
  'taxas municipais',
  'contribuição de melhoria',
  'contribuicao de melhoria',
  'dívida ativa',
  'divida ativa',
  'autuações de trânsito',
  'autuacoes de transito',
  'multas de trânsito',
  'multas de transito',
  'infrações de trânsito',
  'infracoes de transito',
];

// Exportado como objeto para facilitar uso no relevance.js
const GRUPO_B = { regex: GRUPO_B_REGEX, frases: GRUPO_B_FRASES };

// ── Formatos alternativos ao DAM ──────────────────────────────────────────────
// Presença de qualquer um = edital NÃO é DAM-exclusivo (Level 1 decide GREEN)
// Evitados termos curtos (doc, ted) que são substrings de outras palavras
const FORMATOS_ALTERNATIVOS = [
  'pix',
  'boleto',
  'pagamento digital',
  'transferência eletrônica',
  'transferencia eletronica',
  'cartão de crédito',
  'cartao de credito',
  'débito em conta',
  'debito em conta',
  'pagamento online',
  'internet banking',
  'mobile banking',
  'pagamento eletrônico',
  'pagamento eletronico',
];

// ── Marcadores de DAM ─────────────────────────────────────────────────────────
// "dam" é tratado via word boundary (/\bdam\b/) para não casar em "Amsterdam" etc.
// As frases abaixo usam includes() após normalização
const FRASES_DAM = [
  'documento de arrecadação municipal',
  'documento de arrecadacao municipal',
  'guia de arrecadação municipal',
  'guia de arrecadacao municipal',
  'guia dam',
];

module.exports = { GRUPO_A, GRUPO_B, FORMATOS_ALTERNATIVOS, FRASES_DAM };

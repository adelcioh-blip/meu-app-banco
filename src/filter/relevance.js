'use strict';

const { GRUPO_A, GRUPO_B, FORMATOS_ALTERNATIVOS, FRASES_DAM } = require('./groups');

// ── Normalização ──────────────────────────────────────────────────────────────
// Remove acentos via NFD decomposition — robusto a variações tipográficas do PNCP
function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Pré-normaliza listas uma única vez na carga do módulo
const _GA       = GRUPO_A.map(normalize);
const _GB_FRASES = GRUPO_B.frases.map(normalize);   // frases longas — includes()
const _GB_REGEX  = GRUPO_B.regex;                   // acrônimos curtos — /\biss\b/ etc.
const _FMT       = FORMATOS_ALTERNATIVOS.map(normalize);
const _DAM       = FRASES_DAM.map(normalize);

// Regex com word boundary para "dam" — não casa em "amsterdam", "adamastor" etc.
const DAM_REGEX = /\bdam\b/;

// ── Detecção de DAM ───────────────────────────────────────────────────────────
function detectaDam(tNorm) {
  if (DAM_REGEX.test(tNorm)) return true;
  return _DAM.some(frase => tNorm.includes(frase));
}

// ── Detecção de formatos alternativos ────────────────────────────────────────
function detectaFormatos(tNorm) {
  return _FMT.filter(f => tNorm.includes(f));
}

// ── Match de grupo ────────────────────────────────────────────────────────────
// Retorna 'A', 'B' ou null. Grupo A tem precedência.
function matchGrupo(objeto) {
  const t = normalize(objeto);
  if (_GA.some(k => t.includes(k))) return 'A';
  if (_GB_REGEX.some(r => r.test(t))) return 'B';
  if (_GB_FRASES.some(k => t.includes(k))) return 'B';
  return null;
}

// ── Classificador Level 1 (sem IA, só texto da descrição) ────────────────────
// Entrada: objeto/descrição completo do edital
// Saída:   { classificacao, dam_exclusivo, formas_emissao, justificativa }
//
// Regras:
//   Grupo B match   → REVISAR automático (não avalia DAM)
//   Sem DAM         → GREEN  (livre para qualquer formato)
//   DAM + outros    → GREEN  (DAM é uma das opções, não a única)
//   DAM sem outros  → REVISAR (ambíguo — aguarda Level 2 via IA)
//   RED é atribuído apenas pelo Level 2 (leitura do PDF)
function classificarNivel1(objeto, grupo) {
  if (grupo === 'B') {
    return {
      classificacao: 'REVISAR',
      dam_exclusivo: null,
      formas_emissao: JSON.stringify([]),
      justificativa: 'Match apenas no Grupo B (tributários/correlatos) — triagem manual necessária',
    };
  }

  const t = normalize(objeto);
  const temDam = detectaDam(t);
  const formatos = detectaFormatos(t);
  const dam_exclusivo = temDam && formatos.length === 0;

  const formas_emissao = [];
  if (temDam) formas_emissao.push('DAM');
  formas_emissao.push(...formatos.map(f => {
    // Devolve o termo original (não normalizado) para legibilidade
    const idx = _FMT.indexOf(f);
    return FORMATOS_ALTERNATIVOS[idx] || f;
  }));

  let classificacao, justificativa;

  if (!temDam) {
    classificacao = 'GREEN';
    justificativa = 'Sem menção a DAM na descrição — objeto aberto a qualquer formato de emissão';
  } else if (!dam_exclusivo) {
    classificacao = 'GREEN';
    justificativa = `DAM presente junto com: ${formatos.join(', ')} — não exclusivo`;
  } else {
    classificacao = 'REVISAR';
    justificativa = 'DAM mencionado sem formatos alternativos na descrição — requer leitura do edital (Level 2)';
  }

  return {
    classificacao,
    dam_exclusivo: dam_exclusivo ? 1 : (temDam ? 0 : null),
    formas_emissao: JSON.stringify(formas_emissao),
    justificativa,
  };
}

// ── Score numérico de relevância ──────────────────────────────────────────────
// Baseado no texto COMPLETO (sem truncamento). Grupo A vale mais que Grupo B.
function score(objeto) {
  const t = normalize(objeto);
  const ga = _GA.filter(k => t.includes(k)).length;
  const gb = _GB_FRASES.filter(k => t.includes(k)).length
           + _GB_REGEX.filter(r => r.test(t)).length;
  return ga * 5 + gb * 2;
}

module.exports = { normalize, matchGrupo, classificarNivel1, score };

// ── Autoteste (node src/filter/relevance.js) ──────────────────────────────────
if (require.main === module) {
  const casos = [
    // [descrição, grupo esperado, classificacao esperada]
    ['Banco arrecadador para emissao de DAM tributario municipal', 'A', 'REVISAR'],
    ['Contratacao de sistema de arrecadacao municipal via PIX e boleto bancario', 'A', 'GREEN'],
    ['Banco arrecadador para guia de arrecadacao com boleto e PIX e DAM', 'A', 'GREEN'],
    ['Servicos de cobranca de IPTU e taxas municipais', 'B', 'REVISAR'],
    ['Fornecimento de merenda escolar para escolas municipais', null, null],
    ['Plataforma de pagamento para arrecadacao via PIX', 'A', 'GREEN'],
    ['Arrecadacao municipal via DAM documento de arrecadacao municipal', 'A', 'REVISAR'],
    ['Gateway de pagamento processamento de pagamentos boleto pix cartao de credito', 'A', 'GREEN'],
  ];

  let passou = 0, falhou = 0;
  for (const [obj, grupoEsp, classEsp] of casos) {
    const grupo = matchGrupo(obj);
    const result = grupo ? classificarNivel1(obj, grupo) : null;
    const classObtida = result ? result.classificacao : null;
    const ok = grupo === grupoEsp && classObtida === classEsp;
    if (ok) passou++;
    else falhou++;
    const label = ok ? 'OK' : 'FAIL';
    console.log(`${label}  grupo=${grupo}(esp:${grupoEsp})  class=${classObtida}(esp:${classEsp})  "${obj.slice(0, 55)}..."`);
  }
  console.log(`\n${passou}/${passou + falhou} testes passaram`);
  process.exit(falhou > 0 ? 1 : 0);
}

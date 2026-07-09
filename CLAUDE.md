# Radar de Licitações — PNCP

## Objetivo
Buscador especializado em licitações de arrecadação municipal, meios de
pagamento e serviços bancários. Foco em editais onde DAM **não** é forma
exclusiva de emissão (tese jurídica: exigência sem nexo com objeto segundo
Lei 14.133/2021 quando existe alternativa tecnológica — BaaS/PIX/boleto).

## Stack
- Backend: Node.js 18+ + Express
- Banco: SQLite (arquivo local em `data/licitacoes.db`)
  — schema idêntico ao Postgres; troca é só de driver + connection string
- Frontend: React (fase seguinte — não implementado)
- IA: Claude API — Level 2 do classificador DAM (deferido)

## Módulos implementados (MVP — Sessão 1)
```
src/filter/     grupos A/B, regra DAM nível 1, score
src/ingestion/  cliente HTTP PNCP, normalizador de campos
src/db/         schema SQLite, queries CRUD
src/api/        Express server, endpoints REST
scripts/        utilitários (validação de query, ingestão manual)
legacy/         app_banco.py — Streamlit original (em produção, não alterar)
```

## Fonte de dados
- Primária: `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao`
- Alternativa (exploratória): `https://pncp.gov.br/api/search/`

## Filtro de objeto — Grupos A e B
- **Grupo A** (núcleo forte): qualquer match → roda classificador DAM nível 1
- **Grupo B** (tributários/correlatos): qualquer match → `classificacao = REVISAR` automático
- Sem match em nenhum grupo → descarta (não persiste)

## Classificador DAM — 2 níveis
### Nível 1 (grátis — só texto da descrição)
| Condição | classificacao |
|---|---|
| Sem menção a DAM | GREEN |
| DAM + formato alternativo na descrição | GREEN |
| DAM sem nenhum formato alternativo | REVISAR (aguarda Level 2) |

### Nível 2 (IA — DEFERIDO)
- Acionado quando Level 1 retorna REVISAR por DAM-sem-alternativa
- Lê o PDF do edital via Claude API
- Retorna JSON: `{ formas_de_emissao_mencionadas, dam_e_exclusivo, justificativa, classificacao }`
- Pode promover REVISAR para GREEN ou RED

## Endpoints da API
| Método | Path | Descrição |
|---|---|---|
| GET | /api/licitacoes | busca com filtros |
| GET | /api/licitacoes/:id | detalhe |
| GET | /api/stats | contagens por classificação |
| POST | /api/varredura | dispara coleta (síncrono) |
| GET | /api/varreduras | histórico de execuções |

## Modo B (full-text) — uso correto
O endpoint `/api/search/` do PNCP é exploratório: retorna resultados do
índice de texto sem garantia de cobertura. Usar apenas para descoberta;
o modo estruturado (`/api/consulta/`) é a fonte canônica para produção.
A sintaxe booleana OR/parênteses pode não ser suportada — ver resultado
de `npm run validate-query`.

## Fora de escopo (MVP)
- Kanban de oportunidades
- Alertas automáticos (e-mail/WhatsApp)
- Análise de concorrentes / histórico de atas
- Máquina de lances
- Monitoramento de chat de pregão
- Scraping de portais estaduais/municipais

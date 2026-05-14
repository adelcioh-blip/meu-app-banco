import streamlit as st
import pandas as pd
import urllib.parse
import urllib.request
import urllib.error
import json
import ssl
import time
from datetime import date, timedelta

st.set_page_config(page_title="Radar — Arrecadação Municipal", layout="wide")
st.title("🏦 Radar de Licitações — Recolhimento de Tributos e Receitas Municipais")

# ── SSL ───────────────────────────────────────────────────────────────────────
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

# ── Endpoints PNCP ────────────────────────────────────────────────────────────
CONSULTA_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
SEARCH_URL   = "https://pncp.gov.br/api/search/"
PNCP_BASE    = "https://pncp.gov.br"

# ── Termos de relevância (filtro local) ───────────────────────────────────────
# Grupo A — qualquer um é suficiente para confirmar relevância
TERMOS_A = [
    "febraban",
    "documento de arrecadação municipal",
    "banco arrecadador",
    "credenciamento de instituições financeiras para arrecadação",
    "credenciamento de bancos",
    "dam ",
]
# Grupo B — dois ou mais confirmam relevância
TERMOS_B = [
    "arrecadação municipal",
    "recolhimento de tributos municipais",
    "receitas municipais",
    "serviços bancários de arrecadação",
    "tributos municipais",
    "guia de arrecadação",
    "arrecadação de tributos",
    "receitas públicas municipais",
    "credenciamento bancário",
    "recolhimento de receitas",
    "arrecadação de receitas municipais",
]

# ── Status ────────────────────────────────────────────────────────────────────
STATUS_OPCOES = {
    "Somente em aberto (recebendo proposta)": "recebendo_proposta",
    "Todos (abertos + encerrados)":           "",
}
# Palavras-chave que indicam edital ainda ativo no campo situacaoCompraNome
_SITUACAO_ABERTO_KW = {"recebendo", "aberto", "ativo", "publicado", "vigente"}


# ── HTTP com retry ────────────────────────────────────────────────────────────
def http_get(url: str, tentativas: int = 3, timeout: int = 45) -> dict | None:
    for tentativa in range(1, tentativas + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as r:
                body = r.read()
                return json.loads(body.decode("utf-8")) if body.strip() else None
        except urllib.error.HTTPError as e:
            return {"_erro": f"HTTP {e.code} — {e.reason}"}
        except Exception as e:
            if tentativa == tentativas:
                return {"_erro": str(e)}
            time.sleep(2)
    return None


# ── Relevância ────────────────────────────────────────────────────────────────
def score_relevancia(texto: str) -> int:
    t = texto.lower()
    return sum(10 for k in TERMOS_A if k in t) + sum(3 for k in TERMOS_B if k in t)


def eh_relevante(texto: str) -> bool:
    t = texto.lower()
    if any(k in t for k in TERMOS_A):
        return True
    return sum(1 for k in TERMOS_B if k in t) >= 2


def situacao_aberta(nome: str) -> bool:
    t = nome.lower()
    return any(kw in t for kw in _SITUACAO_ABERTO_KW)


# ── Normalização da resposta da API /consulta ─────────────────────────────────
def _normalizar_consulta(raw: dict) -> dict:
    """Converte os campos da API /consulta para o formato interno comum."""
    orgao   = raw.get("orgaoEntidade")   or {}
    unidade = raw.get("unidadeOrgao")    or {}
    cnpj    = orgao.get("cnpj", "")
    ano     = raw.get("anoCompra",         raw.get("ano", ""))
    seq     = raw.get("sequencialCompra",  raw.get("numeroSequencial", raw.get("numero_sequencial", "")))

    sit_nome = (raw.get("situacaoCompraNome")
                or raw.get("situacaoNome")
                or raw.get("situacao_nome")
                or "—")

    pub = (raw.get("dataPublicacaoPncp") or raw.get("data_publicacao_pncp") or "")[:10]
    ini = (raw.get("dataAberturaProposta") or raw.get("data_inicio_vigencia") or "")[:10]
    fim = (raw.get("dataEncerramentoProposta") or raw.get("dataEncerramentoOferta")
           or raw.get("data_fim_vigencia") or "")[:10]

    return {
        "_recebendo":            situacao_aberta(sit_nome),
        "item_url":              f"/compras/{cnpj}/{ano}/{seq}" if cnpj and ano and seq else "",
        "orgao_cnpj":            cnpj,
        "ano":                   ano,
        "numero_sequencial":     seq,
        "orgao_nome":            (orgao.get("razaoSocial") or raw.get("orgao_nome") or "—"),
        "municipio_nome":        (unidade.get("municipioNome") or raw.get("municipio_nome") or "—"),
        "uf":                    (unidade.get("ufSigla") or raw.get("uf") or "—"),
        "data_publicacao_pncp":  pub,
        "data_inicio_vigencia":  ini,
        "data_fim_vigencia":     fim,
        "valor_global":          raw.get("valorTotalEstimado") or raw.get("valor_global") or 0,
        "description":           raw.get("objetoCompra") or raw.get("description") or "—",
        "modalidade_licitacao_nome": (raw.get("modalidadeNome")
                                      or raw.get("modalidade_licitacao_nome") or "—"),
        "situacao_nome":         sit_nome,
    }


# ── Cache de página da API estruturada ───────────────────────────────────────
@st.cache_data(ttl=1800, show_spinner=False)
def _pagina_consulta(data_ini_s: str, data_fim_s: str, uf: str,
                     pagina: int, tam_pagina: int) -> dict | None:
    params = {
        "dataInicial":   data_ini_s,
        "dataFinal":     data_fim_s,
        "pagina":        pagina,
        "tamanhoPagina": tam_pagina,
    }
    if uf:
        params["uf"] = uf
    return http_get(CONSULTA_URL + "?" + urllib.parse.urlencode(params))


# ── Busca via API estruturada ─────────────────────────────────────────────────
def buscar_estruturado(data_ini: date, data_fim: date, uf: str,
                       status: str, max_paginas: int, tam_pagina: int,
                       barra) -> tuple[list, int, list]:
    """
    Usa /api/consulta/v1/contratacoes/publicacao.
    - Filtro nativo de UF e intervalo de datas (servidor)
    - Filtro de relevância por termos (local)
    - Filtro de status (local, por texto do situacaoCompraNome)
    """
    todos, erros, total_api = [], [], 0
    data_ini_s = data_ini.strftime("%Y%m%d")
    data_fim_s = data_fim.strftime("%Y%m%d")
    apenas_aberto = status == "recebendo_proposta"

    for pagina in range(1, max_paginas + 1):
        barra.progress(
            (pagina - 1) / max_paginas,
            text=f"📡 API estruturada — pág. {pagina}/{max_paginas} | UF: {uf or 'todas'} | {data_ini_s}–{data_fim_s}",
        )

        resp = _pagina_consulta(data_ini_s, data_fim_s, uf, pagina, tam_pagina)

        if resp is None:
            break
        if "_erro" in resp:
            erros.append(f"Pág. {pagina}: {resp['_erro']}")
            break

        # A API pode retornar "data" ou "items"
        raws      = resp.get("data") or resp.get("items") or []
        total_api = resp.get("totalRegistros") or resp.get("total") or total_api

        if not raws:
            break

        total_paginas = resp.get("totalPaginas") or 0

        for raw in raws:
            item = _normalizar_consulta(raw)

            if apenas_aberto and not item["_recebendo"]:
                continue

            if not eh_relevante(str(item["description"])):
                continue

            todos.append(item)

        if total_paginas and pagina >= total_paginas:
            break
        if len(raws) < tam_pagina:
            break

    barra.progress(1.0, text="✅ Concluído.")
    return todos, total_api, erros


# ── Cache de página do /api/search ───────────────────────────────────────────
@st.cache_data(ttl=1800, show_spinner=False)
def _pagina_search(query: str, status: str, pagina: int, tam_pagina: int) -> dict | None:
    params = {
        "q":               query,
        "tipos_documento": "edital",
        "ordenacao":       "-data",
        "pagina":          pagina,
        "tam_pagina":      tam_pagina,
    }
    if status:
        params["status"] = status
    return http_get(SEARCH_URL + "?" + urllib.parse.urlencode(params))


# ── Busca via full-text /api/search ──────────────────────────────────────────
def buscar_search(query: str, status: str, uf: str,
                  data_ini: date, data_fim: date,
                  max_paginas: int, tam_pagina: int,
                  barra) -> tuple[list, int, list]:
    todos, erros, total_api = [], [], 0

    for pagina in range(1, max_paginas + 1):
        barra.progress(
            (pagina - 1) / max_paginas,
            text=f"🔍 Full-text PNCP — pág. {pagina}/{max_paginas}…",
        )
        resp = _pagina_search(query, status, pagina, tam_pagina)

        if resp is None:
            break
        if "_erro" in resp:
            erros.append(f"Pág. {pagina}: {resp['_erro']}")
            break

        items     = resp.get("items", [])
        total_api = resp.get("total", total_api)

        if not items:
            break

        for item in items:
            if uf and item.get("uf", "").upper() != uf.upper():
                continue
            pub = (item.get("data_publicacao_pncp") or "")[:10]
            if pub and (pub < data_ini.isoformat() or pub > data_fim.isoformat()):
                continue
            todos.append(item)

        if len(items) < tam_pagina:
            break

    barra.progress(1.0, text="✅ Concluído.")
    return todos, total_api, erros


# ── Montar linha para exibição ────────────────────────────────────────────────
def montar_row(item: dict) -> dict:
    raw_url = item.get("item_url") or ""
    if raw_url.startswith("/compras/"):
        portal_path = raw_url.replace("/compras/", "/app/editais/", 1)
    else:
        cnpj = item.get("orgao_cnpj", "")
        ano  = item.get("ano", "")
        seq  = item.get("numero_sequencial", "")
        portal_path = f"/app/editais/{cnpj}/{ano}/{seq}" if cnpj and ano and seq else "/app/editais"
    link = PNCP_BASE + portal_path

    pub  = (item.get("data_publicacao_pncp") or "—")[:10]
    ini  = (item.get("data_inicio_vigencia") or "—")[:10]
    fim  = (item.get("data_fim_vigencia")    or "—")[:10]

    valor = item.get("valor_global") or 0
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        valor = 0.0

    objeto = str(item.get("description") or "—")[:220]
    score  = score_relevancia(objeto)

    return {
        "★":           score,
        "PUBLICAÇÃO":  pub,
        "INÍCIO":      ini,
        "VIGÊNCIA ATÉ":fim,
        "ÓRGÃO":       (item.get("orgao_nome")    or "—")[:60],
        "MUNICÍPIO":   (item.get("municipio_nome") or "—")[:40],
        "UF":          item.get("uf", "—"),
        "OBJETO":      objeto,
        "MODALIDADE":  item.get("modalidade_licitacao_nome", "—"),
        "SITUAÇÃO":    item.get("situacao_nome", "—"),
        "VALOR R$":    valor,
        "LINK":        link,
    }


# ── SIDEBAR ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("🎯 Filtros de Busca")

    modo = st.radio(
        "Modo de busca:",
        ["🏛️ API Estruturada (recomendado)", "🔍 Full-text PNCP"],
        index=0,
        help=(
            "**API Estruturada**: filtra UF e datas no servidor. "
            "Varre *todos* os editais do período e seleciona os relevantes.\n\n"
            "**Full-text**: busca por termos no índice do portal PNCP."
        ),
    )
    usar_estruturada = modo.startswith("🏛️")

    status_label = st.radio(
        "Status dos editais:",
        list(STATUS_OPCOES.keys()),
        index=0,
    )
    status_val = STATUS_OPCOES[status_label]

    uf = st.text_input("UF (Opcional):", "").upper().strip()

    st.markdown("---")
    st.markdown("**Período de publicação**")
    preset = st.radio(
        "Predefinido:",
        ["Últimos 7 dias", "Últimos 30 dias", "Últimos 90 dias", "Personalizado"],
        index=1,
    )
    hoje = date.today()
    if preset == "Últimos 7 dias":
        data_ini, data_fim = hoje - timedelta(days=7),  hoje
    elif preset == "Últimos 30 dias":
        data_ini, data_fim = hoje - timedelta(days=30), hoje
    elif preset == "Últimos 90 dias":
        data_ini, data_fim = hoje - timedelta(days=90), hoje
    else:
        c1, c2 = st.columns(2)
        data_ini = c1.date_input("De:",   value=hoje - timedelta(days=30))
        data_fim = c2.date_input("Até:",  value=hoje)

    st.markdown("---")

    if usar_estruturada:
        tam_pagina = st.select_slider(
            "Registros por página (API):",
            options=[100, 200, 500],
            value=500,
            help="A API estruturada suporta até 500 por página — use 500 para minimizar chamadas.",
        )
    else:
        tam_pagina = st.select_slider(
            "Resultados por página (API):",
            options=[10, 20, 50],
            value=20,
        )

    max_paginas = st.slider(
        "Páginas por consulta:",
        min_value=1, max_value=20 if usar_estruturada else 10,
        value=5 if usar_estruturada else 3,
        help=(
            f"{tam_pagina} resultados/página × N páginas."
            " Aumente para cobrir períodos mais longos."
        ),
    )

    valor_minimo = st.number_input(
        "Valor mínimo (R$):",
        min_value=0, value=0, step=10_000,
        help="Filtra pelo valor global estimado.",
    )

    if not usar_estruturada:
        st.markdown("---")
        with st.expander("🔎 Query de busca"):
            query = st.text_area(
                "Termos (enviados ao PNCP):",
                value="DAM FEBRABAN",
                height=68,
                help="Busca full-text no índice do PNCP.",
            )
    else:
        query = ""

    btn = st.button("🚀 EXECUTAR VARREDURA", use_container_width=True)


# ── CORPO PRINCIPAL ───────────────────────────────────────────────────────────
if btn:
    barra = st.progress(0)

    if usar_estruturada:
        itens, total_api, erros = buscar_estruturado(
            data_ini, data_fim, uf, status_val,
            max_paginas, tam_pagina, barra,
        )
        modo_label = "API Estruturada /consulta"
    else:
        itens, total_api, erros = buscar_search(
            query.strip(), status_val, uf,
            data_ini, data_fim,
            max_paginas, tam_pagina, barra,
        )
        modo_label = f"Full-text: «{query.strip()}»"

    if erros:
        with st.expander(f"⚠️ {len(erros)} aviso(s)"):
            for e in erros:
                st.warning(e)

    rows = [montar_row(i) for i in itens]
    df   = pd.DataFrame(rows) if rows else pd.DataFrame()

    if valor_minimo > 0 and not df.empty:
        df = df[df["VALOR R$"] >= valor_minimo].reset_index(drop=True)

    # Ordenar por score de relevância (decrescente)
    if not df.empty and "★" in df.columns:
        df = df.sort_values("★", ascending=False).reset_index(drop=True)

    # ── Métricas ──────────────────────────────────────────────────────────────
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total na API (período/UF)", f"{total_api:,}")
    c2.metric("Relevantes encontrados", f"{len(itens):,}")
    c3.metric("Exibidos (após filtros)", f"{len(df):,}")
    c4.metric("Modo", modo_label[:30])

    # ── Resultados ────────────────────────────────────────────────────────────
    if df.empty:
        st.info(
            "Nenhum edital encontrado com os filtros aplicados.\n\n"
            "**Sugestões:**\n"
            "- Ampliar o período ou selecionar 'Todos' no status\n"
            "- Remover filtro de UF\n"
            "- Aumentar páginas ou registros por página\n"
            "- Mudar para modo Full-text e ajustar a query"
        )
    else:
        if not uf:
            ufs_disp = sorted(df["UF"].dropna().unique().tolist())
            if len(ufs_disp) > 1:
                ufs_sel = st.multiselect(
                    "Filtrar por UF nos resultados:", ufs_disp, default=ufs_disp
                )
                df = df[df["UF"].isin(ufs_sel)].reset_index(drop=True)

        st.success(f"**{len(df)}** edital(is) — ordenados por relevância (★).")

        df_exib = df.copy()
        df_exib["VALOR R$"] = df_exib["VALOR R$"].apply(
            lambda v: (
                f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                if v > 0 else "—"
            )
        )

        st.dataframe(
            df_exib,
            column_config={
                "★":           st.column_config.NumberColumn("★ Relev.", width="small",
                                   help="Score de relevância — termos DAM/FEBRABAN/arrecadação"),
                "LINK":        st.column_config.LinkColumn("🔗 Edital", display_text="ABRIR"),
                "OBJETO":      st.column_config.Column(width="large"),
                "ÓRGÃO":       st.column_config.Column(width="medium"),
                "MUNICÍPIO":   st.column_config.Column(width="small"),
                "UF":          st.column_config.Column(width="small"),
                "PUBLICAÇÃO":  st.column_config.Column(width="small"),
                "INÍCIO":      st.column_config.Column(width="small"),
                "VIGÊNCIA ATÉ":st.column_config.Column(width="small"),
                "MODALIDADE":  st.column_config.Column(width="small"),
                "SITUAÇÃO":    st.column_config.Column(width="small"),
                "VALOR R$":    st.column_config.Column(width="small"),
            },
            hide_index=True,
            use_container_width=True,
        )

        csv = df.to_csv(index=False).encode("utf-8")
        st.download_button(
            "⬇️ Exportar CSV", csv, "radar_arrecadacao.csv", "text/csv"
        )

else:
    st.info("Configure os filtros no painel lateral e clique em **EXECUTAR VARREDURA**.")

st.divider()
st.caption(
    "v81 | API Estruturada /consulta (UF+data servidor) + score relevância + cache 30min | PNCP"
)

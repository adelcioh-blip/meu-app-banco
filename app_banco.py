import streamlit as st
import pandas as pd
import urllib.parse
import urllib.request
import urllib.error
import json
import ssl
from datetime import date, timedelta

st.set_page_config(page_title="Radar — Arrecadação Municipal", layout="wide")
st.title("🏦 Radar de Licitações — Recolhimento de Tributos e Receitas Municipais")

# ── SSL ───────────────────────────────────────────────────────────────────────
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

# ── Endpoint correto descoberto via inspeção do portal PNCP ──────────────────
# O portal usa /api/search/ com busca full-text — completamente diferente de
# /api/consulta/v1/contratacoes/publicacao que usávamos antes (sem texto)
SEARCH_URL = "https://pncp.gov.br/api/search/"
PNCP_BASE  = "https://pncp.gov.br"

# ── Query de busca especializada ─────────────────────────────────────────────
# "DAM FEBRABAN" retorna exclusivamente editais de credenciamento de
# instituições financeiras para arrecadação municipal — sem falsos positivos
QUERY_PADRAO = "DAM FEBRABAN"

# ── Status disponíveis no PNCP ───────────────────────────────────────────────
STATUS_OPCOES = {
    "Somente em aberto (recebendo proposta)": "recebendo_proposta",
    "Todos (abertos + encerrados)":           "",
}


# ── HTTP com retry ────────────────────────────────────────────────────────────
def http_get(url: str, tentativas: int = 3, timeout: int = 45):
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
            import time; time.sleep(2)


# ── Busca principal ───────────────────────────────────────────────────────────
def buscar(query: str, status: str, uf: str,
           data_ini: date, data_fim: date,
           max_paginas: int, tam_pagina: int,
           barra) -> tuple[list, int, list]:

    todos  = []
    total_api = 0
    erros  = []

    for pagina in range(1, max_paginas + 1):
        barra.progress(
            (pagina - 1) / max_paginas,
            text=f"🔍 Consultando PNCP — página {pagina} de {max_paginas}…"
        )

        params = {
            "q":              query,
            "tipos_documento":"edital",
            "ordenacao":      "-data",
            "pagina":         pagina,
            "tam_pagina":     tam_pagina,
        }
        if status:
            params["status"] = status

        url  = SEARCH_URL + "?" + urllib.parse.urlencode(params)
        resp = http_get(url)

        if resp is None:
            break
        if "_erro" in resp:
            erros.append(f"Página {pagina}: {resp['_erro']}")
            break

        items     = resp.get("items", [])
        total_api = resp.get("total", total_api)

        if not items:
            break

        for item in items:
            # Filtro de UF (local — API não oferece parâmetro nativo)
            if uf and item.get("uf", "").upper() != uf.upper():
                continue

            # Filtro de data de publicação
            pub_raw = item.get("data_publicacao_pncp") or ""
            pub_dt  = pub_raw[:10]   # "YYYY-MM-DD"
            if pub_dt:
                if pub_dt < data_ini.isoformat() or pub_dt > data_fim.isoformat():
                    continue

            todos.append(item)

        if len(items) < tam_pagina:
            break   # última página

    barra.progress(1.0, text="✅ Concluído.")
    return todos, total_api, erros


def montar_row(item: dict) -> dict:
    link = PNCP_BASE + (item.get("item_url") or "/app/editais")

    pub = (item.get("data_publicacao_pncp") or "—")[:10]
    fim = (item.get("data_fim_vigencia")    or "—")[:10]
    ini = (item.get("data_inicio_vigencia") or "—")[:10]

    valor = item.get("valor_global") or 0
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        valor = 0.0

    objeto = str(item.get("description") or "—")[:220]

    return {
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
        data_ini = c1.date_input("De:", value=hoje - timedelta(days=30))
        data_fim = c2.date_input("Até:", value=hoje)

    st.markdown("---")
    tam_pagina  = st.select_slider(
        "Resultados por página (API):",
        options=[10, 20, 50],
        value=20,
    )
    max_paginas = st.slider(
        "Páginas por consulta:",
        min_value=1, max_value=10, value=3,
        help="20 resultados/página × 3 páginas = até 60 editais consultados."
    )

    valor_minimo = st.number_input(
        "Valor mínimo (R$):",
        min_value=0, value=0, step=10_000,
        help="Filtra pelo valor global do contrato."
    )

    st.markdown("---")
    with st.expander("🔎 Query de busca"):
        query = st.text_area(
            "Termos (enviados ao PNCP):",
            value=QUERY_PADRAO,
            height=68,
            help="Busca full-text no índice do PNCP. Padrão: 'DAM FEBRABAN'."
        )

    btn = st.button("🚀 EXECUTAR VARREDURA", use_container_width=True)


# ── CORPO PRINCIPAL ───────────────────────────────────────────────────────────
if btn:
    barra = st.progress(0)
    itens, total_api, erros = buscar(
        query.strip(), status_val, uf,
        data_ini, data_fim,
        max_paginas, tam_pagina, barra
    )

    if erros:
        with st.expander(f"⚠️ {len(erros)} aviso(s)"):
            for e in erros:
                st.warning(e)

    # Montar DataFrame
    rows = [montar_row(i) for i in itens]
    df   = pd.DataFrame(rows) if rows else pd.DataFrame()

    # Filtro valor mínimo
    if valor_minimo > 0 and not df.empty:
        df = df[df["VALOR R$"] >= valor_minimo].reset_index(drop=True)

    # ── Métricas ──────────────────────────────────────────────────────────────
    c1, c2, c3 = st.columns(3)
    c1.metric("Total no PNCP (query)", f"{total_api:,}")
    c2.metric("Encontrados no período/UF", f"{len(itens):,}")
    c3.metric("Exibidos (após filtros)", f"{len(df):,}")

    # ── Resultados ────────────────────────────────────────────────────────────
    if df.empty:
        st.info(
            "Nenhum edital encontrado com os filtros aplicados.\n\n"
            "**Sugestões:**\n"
            "- Ampliar o período ou selecionar 'Todos' no status\n"
            "- Remover filtro de UF\n"
            "- Aumentar número de páginas"
        )
    else:
        # Filtro interativo de UF nos resultados (quando UF não foi pré-filtrada)
        if not uf:
            ufs_disp = sorted(df["UF"].dropna().unique().tolist())
            if len(ufs_disp) > 1:
                ufs_sel = st.multiselect(
                    "Filtrar por UF nos resultados:", ufs_disp, default=ufs_disp
                )
                df = df[df["UF"].isin(ufs_sel)].reset_index(drop=True)

        st.success(f"**{len(df)}** edital(is) encontrado(s).")

        # Formatar valor
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
    "v79 | PNCP /api/search/ (full-text) | "
    "query: DAM FEBRABAN | status: recebendo_proposta"
)

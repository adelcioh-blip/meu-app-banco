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

# ── Palavras-chave especializadas ─────────────────────────────────────────────
# Foco: recolhimento de tributos e receitas públicas municipais via DAM/FEBRABAN
PALAVRAS_CHAVE = [
    # Extraídos diretamente do objeto de referência:
    # "PRESTAÇÃO DE SERVIÇOS BANCÁRIOS DE RECOLHIMENTO DE TRIBUTOS E DEMAIS
    #  RECEITAS PÚBLICAS MUNICIPAIS, ATRAVÉS DE DAM, EM PADRÃO FEBRABAN"

    "FEBRABAN",                          # qualificador técnico — altíssima precisão
    "DAM",                               # Documento de Arrecadação Municipal
    "documento de arrecadação municipal",
    "recolhimento de tributos",          # frase exata do objeto
    "receitas públicas municipais",      # frase exata do objeto
    "serviços bancários de arrecadação", # variação direta
    "serviços bancários de recolhimento",# variação direta
    "banco arrecadador",                 # termo técnico do contrato
]

# Modalidades — mantemos todas pois Inexigibilidade cobre contratos diretos
# com bancos (ex: Caixa Econômica, Banco do Brasil como agente exclusivo)
MODALIDADES = {
    6: "Pregão Eletrônico",
    5: "Concorrência Eletrônica",
    4: "Concorrência",
    8: "Dispensa Eletrônica",
    9: "Inexigibilidade",
}

BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"


# ── HTTP ──────────────────────────────────────────────────────────────────────
def http_get(url: str):
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30, context=_SSL) as r:
            body = r.read()
            return json.loads(body.decode("utf-8")) if body.strip() else None
    except urllib.error.HTTPError as e:
        return {"_erro": f"HTTP {e.code}"}
    except Exception as e:
        return {"_erro": str(e)}


def extrair_itens(resp) -> list:
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for k in ("data", "content", "items", "resultado", "contratacoes"):
            v = resp.get(k)
            if isinstance(v, list):
                return v
    return []


CAMPOS_OBJETO = (
    "objetoCompra", "objeto", "descricao",
    "informacaoComplementar", "objetoContratacao",
)

def filtrar(itens: list, termos: list[str]) -> list:
    tl = [t.lower() for t in termos]
    return [
        i for i in itens
        if isinstance(i, dict) and any(
            any(t in str(i.get(c, "")).lower() for t in tl)
            for c in CAMPOS_OBJETO
        )
    ]


def montar_row(i: dict, modalidade_nome: str) -> dict:
    orgao = i.get("orgaoEntidade") or i.get("orgao") or {}
    if isinstance(orgao, str):
        orgao = {"razaoSocial": orgao}

    unidade = i.get("unidadeOrgao") or {}
    cnpj = orgao.get("cnpj", "")
    ano  = i.get("anoCompra") or i.get("ano", "")
    seq  = i.get("sequencialCompra") or i.get("sequencial", "")
    link = (
        f"https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}"
        if cnpj and ano and seq else "https://pncp.gov.br/app/editais"
    )

    objeto = str(
        i.get("objetoCompra") or i.get("objeto") or i.get("descricao") or "—"
    )[:160]

    # Valor estimado — campo chave para priorização comercial
    valor = i.get("valorTotalEstimado") or i.get("valorEstimado") or 0
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        valor = 0.0

    pub = (i.get("dataPublicacaoPncp") or i.get("dataPublicacao") or "—")[:10]
    enc_raw = i.get("dataEncerramentoProposta") or i.get("dataFimRecebimentoProposta") or ""
    enc = enc_raw[:10] if enc_raw else "—"

    situacao = i.get("situacaoCompraNome") or i.get("situacao") or "—"

    return {
        "PUBLICAÇÃO":   pub,
        "ENCERRAMENTO": enc,
        "ÓRGÃO":        orgao.get("razaoSocial", "—")[:55],
        "MUNICÍPIO":    unidade.get("nomeUnidade", "—")[:40],
        "UF":           unidade.get("ufSigla") or orgao.get("uf", "—"),
        "OBJETO":       objeto,
        "VALOR EST. R$": valor,
        "SITUAÇÃO":     situacao,
        "MODALIDADE":   modalidade_nome,
        "LINK":         link,
    }


# ── Varredura principal ───────────────────────────────────────────────────────
def varrer(termos: list[str], uf: str, data_ini: date,
           data_fim: date, modalidades_sel: dict,
           max_pag: int, barra) -> tuple[pd.DataFrame, list[str], dict]:

    todos  = []
    erros  = []
    stats  = {}
    n_mods = len(modalidades_sel)

    for idx, (cod, nome_mod) in enumerate(modalidades_sel.items()):
        barra.progress(idx / n_mods, text=f"🔍 {nome_mod}…")
        verificados = 0
        encontrados = 0

        for pagina in range(1, max_pag + 1):
            params = {
                "dataInicial":                data_ini.strftime("%Y%m%d"),
                "dataFinal":                  data_fim.strftime("%Y%m%d"),
                "codigoModalidadeContratacao": cod,
                "pagina":                     pagina,
                "tamanhoPagina":              50,
            }
            if uf:
                params["uf"] = uf

            resp = http_get(BASE_URL + "?" + urllib.parse.urlencode(params))

            if resp is None:
                break
            if "_erro" in resp:
                erros.append(f"{nome_mod} pág.{pagina}: {resp['_erro']}")
                break

            itens = extrair_itens(resp)
            if not itens:
                break

            verificados += len(itens)
            filtrados = filtrar(itens, termos)
            encontrados += len(filtrados)
            for i in filtrados:
                todos.append(montar_row(i, nome_mod))

            if len(itens) < 50:
                break

        stats[nome_mod] = {"verificados": verificados, "encontrados": encontrados}

    barra.progress(1.0, text="✅ Concluído.")

    if not todos:
        return pd.DataFrame(), erros, stats

    df = (
        pd.DataFrame(todos)
        .drop_duplicates(subset=["LINK"])
        .sort_values(["PUBLICAÇÃO", "VALOR EST. R$"], ascending=[False, False])
        .reset_index(drop=True)
    )
    return df, erros, stats


# ── SIDEBAR ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("🎯 Filtros de Busca")

    uf = st.text_input("UF (Opcional):", "").upper().strip()

    st.markdown("---")
    st.markdown("**Período**")
    preset = st.radio(
        "Predefinido:",
        ["Últimos 7 dias", "Últimos 15 dias", "Últimos 30 dias", "Personalizado"],
        index=2,
    )
    hoje = date.today()
    if preset == "Últimos 7 dias":
        data_ini, data_fim = hoje - timedelta(days=7), hoje
    elif preset == "Últimos 15 dias":
        data_ini, data_fim = hoje - timedelta(days=15), hoje
    elif preset == "Últimos 30 dias":
        data_ini, data_fim = hoje - timedelta(days=30), hoje
    else:
        col1, col2 = st.columns(2)
        data_ini = col1.date_input("De:", value=hoje - timedelta(days=30))
        data_fim = col2.date_input("Até:", value=hoje)

    st.markdown("---")
    st.markdown("**Modalidades**")
    mods_sel = {}
    for cod, nome in MODALIDADES.items():
        if st.checkbox(nome, value=True, key=f"mod_{cod}"):
            mods_sel[cod] = nome

    st.markdown("---")
    max_paginas = st.slider(
        "Páginas por modalidade:",
        min_value=1, max_value=10, value=3,
        help="50 editais/página. 3 páginas = 150 editais verificados por modalidade."
    )

    valor_minimo = st.number_input(
        "Valor mínimo estimado (R$):",
        min_value=0, value=0, step=10000,
        help="Filtra resultados pelo valor estimado do contrato."
    )

    st.markdown("---")
    apenas_abertos = st.checkbox(
        "Somente editais em aberto",
        value=True,
        help=(
            "Exclui editais encerrados, cancelados, homologados ou com "
            "prazo de encerramento já vencido."
        ),
    )

    btn = st.button("🚀 EXECUTAR VARREDURA", use_container_width=True)

    with st.expander(f"📋 {len(PALAVRAS_CHAVE)} termos buscados"):
        for t in PALAVRAS_CHAVE:
            st.caption(f"• {t}")

# ── CORPO PRINCIPAL ───────────────────────────────────────────────────────────
if btn:
    if not mods_sel:
        st.error("Selecione ao menos uma modalidade no painel lateral.")
        st.stop()

    dias = (data_fim - data_ini).days
    if dias > 60:
        st.warning(
            f"Período de **{dias} dias** pode causar timeout nas modalidades com muitos editais. "
            "Recomendado: até 60 dias."
        )

    barra = st.progress(0)
    df, erros, stats = varrer(
        PALAVRAS_CHAVE, uf, data_ini, data_fim, mods_sel, max_paginas, barra
    )

    # ── Filtro: somente editais em aberto ────────────────────────────────────
    SITUACOES_FECHADAS = {
        "encerrada", "cancelada", "homologada", "revogada",
        "anulada", "suspensa", "deserta", "fracassada",
    }
    hoje_iso = date.today().isoformat()  # "YYYY-MM-DD" — comparável com string do PNCP

    if apenas_abertos and not df.empty:
        def esta_aberto(row) -> bool:
            # 1. Verificar situação — elimina cancelados/homologados mesmo sem data
            sit = str(row["SITUAÇÃO"]).lower()
            if any(s in sit for s in SITUACOES_FECHADAS):
                return False
            # 2. Verificar data de encerramento — elimina prazo vencido
            enc = row["ENCERRAMENTO"]
            if enc and enc != "—":
                return enc >= hoje_iso   # "2026-03-20" >= "2026-03-18" → aberto
            # 3. Sem data de encerramento e situação não fechada → mantém
            return True

        antes = len(df)
        df = df[df.apply(esta_aberto, axis=1)].reset_index(drop=True)
        removidos = antes - len(df)
        if removidos:
            st.caption(f"🔍 {removidos} edital(is) encerrado(s) ou vencido(s) ocultado(s).")

    # ── Filtro de valor mínimo ────────────────────────────────────────────────
    if valor_minimo > 0 and not df.empty:
        df = df[df["VALOR EST. R$"] >= valor_minimo].reset_index(drop=True)

    # ── Métricas ──────────────────────────────────────────────────────────────
    total_ver = sum(s["verificados"] for s in stats.values())
    total_enc = sum(s["encontrados"] for s in stats.values())

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Editais verificados", f"{total_ver:,}")
    c2.metric("Matches encontrados", f"{total_enc:,}")
    c3.metric("Após filtro de valor", f"{len(df):,}")
    c4.metric("Período consultado", f"{dias} dias")

    # ── Avisos não críticos ───────────────────────────────────────────────────
    if erros:
        with st.expander(f"⚠️ {len(erros)} aviso(s) — resultados podem ser parciais"):
            for e in erros:
                st.warning(e)

    # ── Resultados ────────────────────────────────────────────────────────────
    if df.empty:
        st.info(
            "Nenhum edital encontrado com os filtros aplicados.\n\n"
            "**Sugestões:**\n"
            "- Ampliar o período de datas\n"
            "- Aumentar o número de páginas\n"
            "- Remover filtro de UF ou de valor mínimo\n"
            "- Verificar se as modalidades estão selecionadas"
        )
    else:
        # Filtro interativo de UF nos resultados
        ufs = sorted(df["UF"].dropna().unique().tolist())
        if len(ufs) > 1 and not uf:
            ufs_sel = st.multiselect("Filtrar UF nos resultados:", ufs, default=ufs)
            df = df[df["UF"].isin(ufs_sel)].reset_index(drop=True)

        st.success(f"**{len(df)}** edital(is) exibido(s).")

        # Formatação de valor
        df_exib = df.copy()
        df_exib["VALOR EST. R$"] = df_exib["VALOR EST. R$"].apply(
            lambda v: f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            if v > 0 else "—"
        )

        st.dataframe(
            df_exib,
            column_config={
                "LINK":         st.column_config.LinkColumn("🔗 Edital", display_text="ABRIR"),
                "OBJETO":       st.column_config.Column(width="large"),
                "ÓRGÃO":        st.column_config.Column(width="medium"),
                "VALOR EST. R$":st.column_config.Column(width="small"),
                "PUBLICAÇÃO":   st.column_config.Column(width="small"),
                "ENCERRAMENTO": st.column_config.Column(width="small"),
                "SITUAÇÃO":     st.column_config.Column(width="small"),
                "MODALIDADE":   st.column_config.Column(width="small"),
                "UF":           st.column_config.Column(width="small"),
            },
            hide_index=True,
            use_container_width=True,
        )

        col_csv, col_stats = st.columns([1, 3])
        with col_csv:
            csv = df.to_csv(index=False).encode("utf-8")
            st.download_button("⬇️ Exportar CSV", csv, "radar_boletos.csv", "text/csv")

    # ── Cobertura por modalidade ──────────────────────────────────────────────
    with st.expander("📊 Cobertura por modalidade"):
        st.dataframe(
            pd.DataFrame([
                {
                    "Modalidade":  m,
                    "Verificados": s["verificados"],
                    "Encontrados": s["encontrados"],
                    "Taxa %": f"{(s['encontrados']/s['verificados']*100):.1f}%"
                    if s["verificados"] > 0 else "—",
                }
                for m, s in stats.items()
            ]),
            hide_index=True,
            use_container_width=True,
        )

else:
    st.info("Configure os filtros no painel lateral e clique em **EXECUTAR VARREDURA**.")

st.divider()
st.caption(
    f"v75 | PNCP /publicacao | {len(PALAVRAS_CHAVE)} termos | "
    "DAM · FEBRABAN · Recolhimento de Tributos Municipais"
)

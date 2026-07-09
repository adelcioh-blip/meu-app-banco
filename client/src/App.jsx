import { useState, useEffect, useCallback } from 'react'
import './index.css'
import { fetchLicitacoes } from './api'
import StatsBar from './components/StatsBar'
import Filters from './components/Filters'
import LicitacaoCard from './components/LicitacaoCard'
import VarreduraModal from './components/VarreduraModal'

const LIMIT = 50

export default function App() {
  const [filters, setFilters] = useState({})
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [statsKey, setStatsKey] = useState(0)

  const load = useCallback(async (off = 0) => {
    setLoading(true); setErro(null)
    try {
      const data = await fetchLicitacoes({ ...filters, limit: LIMIT, offset: off })
      setRows(data.data || [])
      setTotal(data.total || 0)
      setOffset(off)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Recarrega quando filtros mudam
  useEffect(() => { load(0) }, [load])

  function handleVarreduraDone() {
    setStatsKey(k => k + 1)
    load(0)
  }

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            📡 Radar de Licitações
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Arrecadação municipal · Meios de pagamento · BaaS/PIX/Boleto
          </p>
        </div>
        <StatsBar refresh={statsKey} />
        <button
          onClick={() => setShowModal(true)}
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + Nova Varredura
        </button>
      </div>

      {/* Filtros */}
      <Filters filters={filters} onChange={f => { setFilters(f) }} />

      {/* Resultados */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {loading ? 'Buscando…' : `${total} resultado${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {erro && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: 12, background: 'var(--red-bg)', borderRadius: 'var(--radius)' }}>
          Erro: {erro}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(item => <LicitacaoCard key={item.id} item={item} />)}
        {!loading && rows.length === 0 && !erro && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
            Nenhum edital encontrado. Ajuste os filtros ou execute uma varredura.
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={() => load(offset - LIMIT)}
            disabled={offset === 0 || loading}
            style={{ background: 'var(--border)', color: 'var(--text)' }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => load(offset + LIMIT)}
            disabled={offset + LIMIT >= total || loading}
            style={{ background: 'var(--border)', color: 'var(--text)' }}
          >
            Próxima →
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <VarreduraModal
          onClose={() => setShowModal(false)}
          onDone={handleVarreduraDone}
        />
      )}
    </div>
  )
}

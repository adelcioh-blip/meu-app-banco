import { useState } from 'react'
import { dispararVarredura } from '../api'

function today() { return new Date().toISOString().slice(0, 10) }
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export default function VarreduraModal({ onClose, onDone }) {
  const [modo, setModo] = useState('fulltext')
  const [query, setQuery] = useState('arrecadacao municipal OR boleto bancario OR meios de pagamento OR sistema de arrecadacao OR credenciamento bancario')
  const [dataIni, setDataIni] = useState(weekAgo())
  const [dataFim, setDataFim] = useState(today())
  const [uf, setUf] = useState('')
  const [maxPaginas, setMaxPaginas] = useState(5)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [erro, setErro] = useState(null)

  async function executar() {
    setLoading(true); setErro(null); setResult(null)
    try {
      const body = modo === 'fulltext'
        ? { modo: 'fulltext', query, uf: uf || undefined, dataIni: dataIni.replace(/-/g,''), dataFim: dataFim.replace(/-/g,''), maxPaginas: Number(maxPaginas), tamPagina: 20 }
        : { modo: 'estruturado', dataIni: dataIni.replace(/-/g,''), dataFim: dataFim.replace(/-/g,''), uf: uf || undefined, maxPaginas: Number(maxPaginas), tamPagina: 50 }
      const r = await dispararVarredura(body)
      setResult(r)
      if (onDone) onDone()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        width: '100%',
        maxWidth: 540,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, color: 'var(--text)' }}>Nova Varredura</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 18, padding: '2px 8px' }}>×</button>
        </div>

        <div>
          <label>Modo</label>
          <select value={modo} onChange={e => setModo(e.target.value)}>
            <option value="fulltext">Full-text (rápido, ~3s)</option>
            <option value="estruturado">Estruturado (completo, ~4min)</option>
          </select>
        </div>

        {modo === 'fulltext' && (
          <div>
            <label>Query de busca</label>
            <input value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Publicado de</label>
            <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} />
          </div>
          <div>
            <label>Publicado até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <div>
            <label>UF (opcional)</label>
            <input placeholder="ex: SP" maxLength={2} value={uf} onChange={e => setUf(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label>Máx. páginas</label>
            <input type="number" min={1} max={50} value={maxPaginas} onChange={e => setMaxPaginas(e.target.value)} />
          </div>
        </div>

        {erro && <p style={{ color: 'var(--red)', fontSize: 13 }}>{erro}</p>}

        {result && (
          <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 12, fontSize: 13, lineHeight: 2 }}>
            <div>✅ API retornou <strong>{result.total_api}</strong> registros</div>
            <div>🎯 Relevantes (filtro A/B): <strong>{result.total_relevantes}</strong></div>
            <div>💾 Inseridos no banco: <strong style={{ color: 'var(--green)' }}>{result.total_inseridas}</strong></div>
            <div>⟳  Duplicatas ignoradas: <strong>{result.total_duplicatas}</strong></div>
            {result.erros?.length > 0 && (
              <div style={{ color: 'var(--yellow)' }}>⚠ {result.erros.join(' · ')}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'var(--border)', color: 'var(--text)' }}>Cancelar</button>
          <button
            onClick={executar}
            disabled={loading}
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {loading ? (modo === 'estruturado' ? 'Aguarde ~4min…' : 'Buscando…') : 'Executar'}
          </button>
        </div>
      </div>
    </div>
  )
}

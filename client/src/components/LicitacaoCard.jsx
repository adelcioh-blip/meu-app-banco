import Badge from './Badge'

function fmt(val) {
  if (!val) return null
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d) {
  if (!d) return null
  return d.slice(0, 10).split('-').reverse().join('/')
}

export default function LicitacaoCard({ item }) {
  const formas = (() => {
    try { return JSON.parse(item.formas_emissao || '[]') } catch { return [] }
  })()

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Badge value={item.classificacao} />
        <span style={{
          fontSize: 11,
          color: 'var(--muted)',
          background: 'var(--border)',
          borderRadius: 4,
          padding: '2px 7px',
        }}>
          Grupo {item.grupo_match}
        </span>
        {item.dam_exclusivo === 1 && (
          <span style={{
            fontSize: 11,
            color: 'var(--red)',
            background: 'var(--red-bg)',
            borderRadius: 4,
            padding: '2px 7px',
            border: '1px solid var(--red)44',
          }}>
            DAM exclusivo
          </span>
        )}
        {formas.length > 0 && formas.map(f => (
          <span key={f} style={{
            fontSize: 11,
            color: 'var(--blue)',
            background: 'rgba(96,165,250,0.08)',
            borderRadius: 4,
            padding: '2px 7px',
          }}>
            {f}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {item.municipio}/{item.uf} · {item.modalidade}
        </span>
      </div>

      <p style={{ lineHeight: 1.5, color: 'var(--text)' }}>{item.objeto}</p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {item.orgao_nome}
        </span>
        {item.valor_global && (
          <span style={{ fontSize: 12, color: 'var(--text)' }}>
            {fmt(item.valor_global)}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          pub. {fmtDate(item.data_publicacao)}
        </span>
        {item.data_fim && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            encerra {fmtDate(item.data_fim)}
          </span>
        )}
        {item.justificativa && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            {item.justificativa}
          </span>
        )}
        <a href={item.link} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 12 }}>
          Abrir edital ↗
        </a>
      </div>
    </div>
  )
}

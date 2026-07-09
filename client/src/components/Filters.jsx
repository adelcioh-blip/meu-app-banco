const UFS = [
  '', 'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

export default function Filters({ filters, onChange }) {
  const set = (k, v) => onChange({ ...filters, [k]: v })

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      gap: 10,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 14,
    }}>
      <div>
        <label>Busca livre</label>
        <input
          placeholder="palavra no objeto…"
          value={filters.q || ''}
          onChange={e => set('q', e.target.value)}
        />
      </div>

      <div>
        <label>UF</label>
        <select value={filters.uf || ''} onChange={e => set('uf', e.target.value)}>
          <option value="">Todas</option>
          {UFS.filter(Boolean).map(uf => <option key={uf}>{uf}</option>)}
        </select>
      </div>

      <div>
        <label>Classificação</label>
        <select value={filters.classificacao || ''} onChange={e => set('classificacao', e.target.value)}>
          <option value="">Todas</option>
          <option value="GREEN">Green</option>
          <option value="REVISAR">Revisar</option>
          <option value="RED">Red</option>
        </select>
      </div>

      <div>
        <label>Grupo</label>
        <select value={filters.grupo || ''} onChange={e => set('grupo', e.target.value)}>
          <option value="">A + B</option>
          <option value="A">Grupo A</option>
          <option value="B">Grupo B</option>
        </select>
      </div>

      <div>
        <label>Publicado de</label>
        <input type="date" value={filters.dataIni || ''} onChange={e => set('dataIni', e.target.value)} />
      </div>

      <div>
        <label>Publicado até</label>
        <input type="date" value={filters.dataFim || ''} onChange={e => set('dataFim', e.target.value)} />
      </div>

      <div>
        <label>Valor mín (R$)</label>
        <input
          type="number"
          placeholder="0"
          value={filters.valorMin || ''}
          onChange={e => set('valorMin', e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button
          onClick={() => onChange({})}
          style={{ background: 'var(--border)', color: 'var(--text)', width: '100%' }}
        >
          Limpar
        </button>
      </div>
    </div>
  )
}

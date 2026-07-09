const COLORS = {
  GREEN:   { color: 'var(--green)',  bg: 'var(--green-bg)',  label: 'Green' },
  REVISAR: { color: 'var(--yellow)', bg: 'var(--yellow-bg)', label: 'Revisar' },
  RED:     { color: 'var(--red)',    bg: 'var(--red-bg)',    label: 'Red' },
}

export default function Badge({ value }) {
  const c = COLORS[value] || { color: 'var(--muted)', bg: 'transparent', label: value || '—' }
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}

import { useEffect, useState } from 'react'
import { fetchStats } from '../api'

export default function StatsBar({ refresh }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {})
  }, [refresh])

  if (!stats) return null

  const { total, green, revisar, red } = stats.totais
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '8px 0', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{total} no banco</span>
      <Stat label="Green" value={green} color="var(--green)" />
      <Stat label="Revisar" value={revisar} color="var(--yellow)" />
      <Stat label="Red" value={red} color="var(--red)" />
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <span style={{ fontSize: 13 }}>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{label}</span>
    </span>
  )
}

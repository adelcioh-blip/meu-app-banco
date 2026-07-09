'use strict'

const BASE = '/api/licitacoes'

export async function fetchLicitacoes(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) qs.set(k, v) })
  const res = await fetch(`${BASE}?${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchStats() {
  const res = await fetch(`${BASE}/meta/stats`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchVarreduras(limit = 10) {
  const res = await fetch(`${BASE}/meta/varreduras?limit=${limit}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function dispararVarredura(body) {
  const res = await fetch(`${BASE}/varredura`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`)
  return data
}

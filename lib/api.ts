import axios from 'axios'
import { getToken, clearToken, LAUNCHPAD_APP_URL } from './auth'

// Ecosystem OS's own backend (backend/) — shares launchpad_v5's Postgres database
// but is a separate Express server, verifying the same bridge JWT independently.
const ECOSYSTEM_API_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3501'

export const api = axios.create({ baseURL: ECOSYSTEM_API_URL, headers: { 'Content-Type': 'application/json' } })

api.interceptors.request.use(cfg => {
  const token = getToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// A 401 here means the bridged token is gone/expired — there's no local login
// to fall back to, so the only recovery is sending the user back through
// Founder OS's Dashboard to re-mint a fresh bridge link for the right startup.
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401 && typeof window !== 'undefined') {
    clearToken()
    window.location.href = `${LAUNCHPAD_APP_URL}/dashboard`
  }
  return Promise.reject(err)
})

export interface StartupContext {
  name: string
  problem: string
  solution: string
  segment: string
  stage: string
  market: string
}

export interface EcosystemMapData {
  startup: StartupContext
  ecosystemMaps: unknown[]
  maxLayers: number
}

export const ecosystemApi = {
  getMap:  () => api.get<EcosystemMapData>('/api/ecosystem-map'),
  saveMap: (ecosystemMaps: unknown[]) => api.put('/api/ecosystem-map', { ecosystemMaps }),
}

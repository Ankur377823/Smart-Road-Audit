/**
 * Base URL for backend API calls. Always goes through the `/api` prefix so request paths never
 * collide with app pages like /audits (the Vite dev proxy, nginx and FastAPI all serve /api).
 * Set VITE_API_BASE_URL only when the API lives on a different origin (e.g. a separate static site).
 */
const configured = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export const API_BASE_URL = configured
  ? (configured.endsWith('/api') ? configured : `${configured}/api`)
  : '/api'

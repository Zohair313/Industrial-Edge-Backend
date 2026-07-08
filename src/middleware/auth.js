import jwt from 'jsonwebtoken'
import { Admin } from '../models/Admin.js'
import { config } from '../config.js'

export const TOKEN_COOKIE = 'ie_admin_token'
export const TOKEN_TTL_SECONDS = config.auth.tokenTtlSeconds // env-configurable session length

/* Fail fast at boot if the signing secret is missing in production. */
export function getJwtSecret() {
  const s = process.env.JWT_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('JWT_SECRET is required in production')
    return 'dev-only-insecure-secret-change-me' // dev fallback only
  }
  return s
}

export function signToken(admin) {
  return jwt.sign(
    { sub: String(admin._id), role: admin.role, email: admin.email },
    getJwtSecret(),
    { expiresIn: TOKEN_TTL_SECONDS, issuer: 'industrial-edge' }
  )
}

export function cookieOptions() {
  const prod = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,                       // not readable from JS → XSS can't steal it
    secure: prod,                         // HTTPS-only in production
    sameSite: prod ? 'none' : 'lax',      // 'none' needs secure; lax is fine for the dev proxy
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  }
}

/* Extract a token from the httpOnly cookie or a Bearer header (for tooling). */
function readToken(req) {
  if (req.cookies?.[TOKEN_COOKIE]) return req.cookies[TOKEN_COOKIE]
  const h = req.headers.authorization
  if (h && h.startsWith('Bearer ')) return h.slice(7)
  return null
}

/* Verifies the token, loads the admin, and attaches req.admin. 401 otherwise. */
export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req)
    if (!token) return res.status(401).json({ error: 'Authentication required' })
    let payload
    try {
      payload = jwt.verify(token, getJwtSecret(), { issuer: 'industrial-edge' })
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    const admin = await Admin.findById(payload.sub)
    if (!admin) return res.status(401).json({ error: 'Account no longer exists' })
    req.admin = admin
    next()
  } catch (e) { next(e) }
}

/* Role gate — use after requireAuth. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Authentication required' })
    if (!roles.includes(req.admin.role))
      return res.status(403).json({ error: 'Insufficient privileges' })
    next()
  }
}

/* Convenience: authenticated + SUPER_ADMIN. */
export const requireSuperAdmin = [requireAuth, requireRole('SUPER_ADMIN')]

import { Router } from 'express'
import { Admin } from '../models/Admin.js'
import { signToken, cookieOptions, requireAuth, TOKEN_COOKIE } from '../middleware/auth.js'

const router = Router()

/* POST /api/auth/login  { email, password } → sets httpOnly cookie */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' })

    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() })
    // Constant-ish response: do not reveal whether the email exists.
    const ok = admin ? await admin.verifyPassword(String(password)) : false
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

    admin.lastLoginAt = new Date()
    await admin.save()

    res.cookie(TOKEN_COOKIE, signToken(admin), cookieOptions())
    res.json({ user: admin.toJSON() })
  } catch (e) { next(e) }
})

/* GET /api/auth/me — refresh-safe session check */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.admin.toJSON() })
})

/* POST /api/auth/logout — clears the cookie */
router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, { ...cookieOptions(), maxAge: undefined })
  res.json({ ok: true })
})

export default router

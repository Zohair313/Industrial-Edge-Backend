/* CSRF guard for cookie-authenticated, state-changing requests.
   Requires a custom header that only same-origin JS (our own client) can set.
   A cross-site <form> cannot add custom headers, and a cross-site fetch with
   one triggers a CORS preflight that our origin allow-list rejects — so a
   forged request can never carry this header while riding the auth cookie. */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next()
  if (req.get('X-Requested-With') === 'industrial-edge') return next()
  return res.status(403).json({ error: 'CSRF check failed' })
}

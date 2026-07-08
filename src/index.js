import 'dotenv/config' // load server/.env before anything reads process.env
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import { connectDB } from './db.js'
import { seedDatabase } from './seed.js'
import { seedAdmin } from './seedAdmin.js'
import productsRouter from './routes/products.js'
import categoriesRouter from './routes/categories.js'
import metaRouter from './routes/meta.js'
import ordersRouter from './routes/orders.js'
import authRouter from './routes/auth.js'
import paymentsRouter from './routes/payments.js'
import { migrateOrderStatuses } from './migrate.js'
import { config } from './config.js'

const PORT = process.env.PORT || 4000

async function main() {
  await connectDB()

  const result = await seedDatabase({ force: true })
  console.log(result.skipped ? `• DB already seeded (${result.products} products)` : `• Seeded ${result.products} products / ${result.categories} categories`)
  await seedAdmin()
  await migrateOrderStatuses()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  // Secure headers.
  app.use(helmet())

  // CORS: lock to an allow-list in production; permissive in dev. Credentials
  // on so the auth cookie flows from the browser.
  const allowed = (process.env.CORS_ORIGIN || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  app.use(cors(allowed.length ? { origin: allowed, credentials: true } : { origin: true, credentials: true }))

  // Capture the raw body so webhook handlers can verify HMAC/RSA signatures
  // against the exact bytes the gateway signed.
  app.use(express.json({ limit: '64kb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8') } }))
  app.use(cookieParser())
  // Strip any keys containing $ or . from body/query/params → blocks Mongo
  // operator injection (e.g. {"email":{"$ne":null}}).
  app.use(mongoSanitize())

  // Global rate limit, with a stricter limiter on auth to throttle brute force.
  app.use('/api', rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, standardHeaders: true, legacyHeaders: false }))
  const authLimiter = rateLimit({ windowMs: config.rateLimit.authWindowMs, max: config.rateLimit.authMax, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, try again later' } })

  app.get('/', (req, res) => res.json({ service: 'Industrial Edge API', docs: '/api' }))
  app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))
  app.use('/api/auth/login', authLimiter)
  app.use('/api/auth', authRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/meta', metaRouter)
  app.use('/api/orders', ordersRouter)
  app.use('/api/payments', paymentsRouter)

  // In production, serve the built frontend.
  if (process.env.NODE_ENV === 'production') {
    const path = await import('path')
    const fs = await import('fs')
    const dist = path.default.resolve(new URL('.', import.meta.url).pathname, '../../dist')
    if (fs.existsSync(dist)) {
      app.use(express.static(dist))
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next()
        res.sendFile(path.default.join(dist, 'index.html'))
      })
    }
  }

  // Centralised error handler — never leak internals/stack in production.
  app.use((err, req, res, next) => {
    const status = err.status || 500
    if (status >= 500) console.error(err)
    const message = status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Server error'
      : err.message || 'Server error'
    res.status(status).json({ error: message })
  })

  app.listen(PORT, () => console.log(`\n▸ Industrial Edge API → http://localhost:${PORT}/api\n`))
}

main().catch((e) => {
  console.error('Fatal startup error:', e)
  process.exit(1)
})

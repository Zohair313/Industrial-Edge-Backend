import { Router } from 'express'
import { Product } from '../models/Product.js'
import { requireSuperAdmin } from '../middleware/auth.js'
import { csrfGuard } from '../middleware/csrf.js'
import { config } from '../config.js'

const router = Router()

// Neutralise regex metacharacters so a query like "a.*" can't become a
// pathological/injected pattern. Bounds the search term too.
const escapeRegex = (s) => String(s).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Force query params to primitives (defends against ?cat[$ne]= object injection).
const str = (v) => (v == null ? undefined : String(v))

// Only these fields may be written via the API (no mass assignment).
const WRITABLE = ['sku', 'name', 'description', 'images', 'category', 'glyph', 'price', 'unit', 'moq', 'stock', 'lead', 'tags', 'tiers', 'status', 'featured', 'specs']
function pick(body = {}) {
  const out = {}
  for (const k of WRITABLE) if (body[k] !== undefined) out[k] = body[k]
  return out
}

/* GET /api/products?cat=&sort=&q=&status=&limit= */
router.get('/', async (req, res, next) => {
  try {
    const cat = str(req.query.cat), sort = str(req.query.sort), q = str(req.query.q), status = str(req.query.status)
    const filter = {}
    if (cat && cat !== 'all') filter.category = cat
    if (status) filter.status = status
    if (req.query.featured === 'true') filter.featured = true
    if (q && String(q).trim()) {
      const safe = escapeRegex(String(q).trim())
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { sku: { $regex: safe, $options: 'i' } },
      ]
    }

    let query = Product.find(filter)
    if (sort === 'price-asc') query = query.sort({ price: 1 })
    else if (sort === 'price-desc') query = query.sort({ price: -1 })
    else if (sort === 'stock') query = query.sort({ stock: -1 })
    else query = query.sort({ createdAt: 1 })

    const limit = Math.min(config.pagination.productSearchMax, Math.max(0, parseInt(req.query.limit, 10) || 0))
    if (limit) query = query.limit(limit)

    const items = await query.lean({ virtuals: true })
    res.json(items)
  } catch (e) { next(e) }
})

/* POST /api/products/import  — bulk upsert. SUPER_ADMIN only.
   Body: { products: [ {...}, ... ] } — creates new, updates existing by SKU. */
router.post('/import', ...requireSuperAdmin, csrfGuard, async (req, res, next) => {
  try {
    const { products } = req.body || {}
    if (!Array.isArray(products) || products.length === 0)
      return res.status(400).json({ error: 'products array is required' })
    const results = { created: 0, updated: 0, errors: [] }
    for (const raw of products) {
      try {
        const data = pick(raw)
        if (!data.sku) { results.errors.push({ sku: raw.sku || '(missing)', error: 'sku is required' }); continue }
        const existing = await Product.findOne({ sku: data.sku })
        if (existing) {
          await Product.updateOne({ sku: data.sku }, { $set: data })
          results.updated++
        } else {
          if (!data.name || !data.category) { results.errors.push({ sku: data.sku, error: 'name and category are required for new products' }); continue }
          await Product.create(data)
          results.created++
        }
      } catch (e) {
        results.errors.push({ sku: raw.sku || '(unknown)', error: e.message })
      }
    }
    res.json(results)
  } catch (e) { next(e) }
})

/* GET /api/products/:id  (id === sku) */
router.get('/:id', async (req, res, next) => {
  try {
    const item = await Product.findOne({ sku: req.params.id }).lean({ virtuals: true })
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
  } catch (e) { next(e) }
})

/* POST /api/products  — SUPER_ADMIN only */
router.post('/', ...requireSuperAdmin, csrfGuard, async (req, res, next) => {
  try {
    const data = pick(req.body)
    if (!data.sku || !data.name || !data.category)
      return res.status(400).json({ error: 'sku, name and category are required' })
    const created = await Product.create(data)
    res.status(201).json(created.toJSON())
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'A product with that SKU already exists' })
    next(e)
  }
})

/* PATCH /api/products/:id  — SUPER_ADMIN only */
router.patch('/:id', ...requireSuperAdmin, csrfGuard, async (req, res, next) => {
  try {
    const data = pick(req.body)
    const updated = await Product.findOneAndUpdate(
      { sku: req.params.id },
      { $set: data },
      { new: true, runValidators: true }
    )
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated.toJSON())
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'A product with that SKU already exists' })
    next(e)
  }
})

/* DELETE /api/products/:id  — SUPER_ADMIN only */
router.delete('/:id', ...requireSuperAdmin, csrfGuard, async (req, res, next) => {
  try {
    const r = await Product.deleteOne({ sku: req.params.id })
    if (!r.deletedCount) return res.status(404).json({ error: 'Not found' })
    res.json({ deleted: r.deletedCount })
  } catch (e) { next(e) }
})

export default router

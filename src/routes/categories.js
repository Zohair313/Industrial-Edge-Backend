import { Router } from 'express'
import { Category } from '../models/Category.js'
import { Product } from '../models/Product.js'
import { requireSuperAdmin } from '../middleware/auth.js'
import { csrfGuard } from '../middleware/csrf.js'

const router = Router()
const admin = [...requireSuperAdmin, csrfGuard]

/* GET /api/categories  → flat list (frontend builds the tree).
   `count` is computed live so the storefront rail always matches
   the live products actually shown. */
router.get('/', async (req, res, next) => {
  try {
    const cats = await Category.find().sort({ order: 1, createdAt: 1 }).lean()
    const grouped = await Product.aggregate([
      { $match: { status: 'live' } },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ])
    const counts = Object.fromEntries(grouped.map((g) => [g._id, g.n]))
    res.json(cats.map((c) => ({ ...c, count: counts[c.slug] || 0 })))
  } catch (e) { next(e) }
})

/* POST /api/categories  { name, parent? } */
router.post('/', ...admin, async (req, res, next) => {
  try {
    const { name, parent = null, blurb = '' } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const code = name.trim().slice(0, 3).toUpperCase()
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const count = await Category.estimatedDocumentCount()
    const cat = await Category.create({ name: name.trim(), code, slug, parent, blurb, order: count, fields: [] })
    res.status(201).json(cat.toJSON())
  } catch (e) { next(e) }
})

/* POST /api/categories/import  — bulk create/update. SUPER_ADMIN only. */
router.post('/import', ...admin, async (req, res, next) => {
  try {
    const { categories } = req.body || {}
    if (!Array.isArray(categories) || categories.length === 0)
      return res.status(400).json({ error: 'categories array is required' })
    const results = { created: 0, updated: 0, errors: [] }
    for (const cat of categories) {
      try {
        if (!cat.name) { results.errors.push({ name: cat.name || '(missing)', error: 'name required' }); continue }
        const slug = cat.slug || cat.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const existing = await Category.findOne({ slug })
        if (existing) {
          const patch = {}
          if (cat.name) patch.name = cat.name.trim()
          if (cat.blurb != null) patch.blurb = cat.blurb
          if (cat.parent != null) patch.parent = cat.parent
          if (cat.fields) patch.fields = cat.fields
          await Category.updateOne({ slug }, { $set: patch })
          results.updated++
        } else {
          const code = cat.code || cat.name.trim().slice(0, 3).toUpperCase()
          const order = cat.order != null ? cat.order : await Category.estimatedDocumentCount()
          await Category.create({
            name: cat.name.trim(), code, slug,
            parent: cat.parent || null, blurb: cat.blurb || '',
            order, fields: cat.fields || [],
          })
          results.created++
        }
      } catch (e) {
        results.errors.push({ name: cat.name || '(unknown)', error: e.message })
      }
    }
    res.json(results)
  } catch (e) { next(e) }
})

/* PATCH /api/categories/:slug  { name?, blurb? } */
router.patch('/:slug', ...admin, async (req, res, next) => {
  try {
    const patch = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim()
    if (typeof req.body.blurb === 'string') patch.blurb = req.body.blurb.trim()
    const cat = await Category.findOneAndUpdate({ slug: req.params.slug }, { $set: patch }, { new: true, runValidators: true })
    if (!cat) return res.status(404).json({ error: 'Not found' })
    res.json(cat.toJSON())
  } catch (e) { next(e) }
})

/* DELETE /api/categories/:slug  (also removes descendants) */
router.delete('/:slug', ...admin, async (req, res, next) => {
  try {
    const { slug } = req.params
    await Category.deleteMany({ $or: [{ slug }, { parent: slug }] })
    res.json({ deleted: slug })
  } catch (e) { next(e) }
})

/* POST /api/categories/:slug/fields  { label, type, unit?, options? } */
router.post('/:slug/fields', ...admin, async (req, res, next) => {
  try {
    const { label, type = 'text', unit, options } = req.body
    if (!label) return res.status(400).json({ error: 'label required' })
    const cat = await Category.findOneAndUpdate(
      { slug: req.params.slug },
      { $push: { fields: { label, type, unit, options } } },
      { new: true, runValidators: true }
    )
    if (!cat) return res.status(404).json({ error: 'Not found' })
    res.status(201).json(cat.toJSON())
  } catch (e) { next(e) }
})

/* DELETE /api/categories/:slug/fields/:fieldId */
router.delete('/:slug/fields/:fieldId', ...admin, async (req, res, next) => {
  try {
    const cat = await Category.findOneAndUpdate(
      { slug: req.params.slug },
      { $pull: { fields: { _id: req.params.fieldId } } },
      { new: true }
    )
    if (!cat) return res.status(404).json({ error: 'Not found' })
    res.json(cat.toJSON())
  } catch (e) { next(e) }
})

export default router

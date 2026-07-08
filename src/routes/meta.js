import { Router } from 'express'
import { config } from '../config.js'
import { Product } from '../models/Product.js'
import { Category } from '../models/Category.js'
import { Order } from '../models/Order.js'

import { requireSuperAdmin } from '../middleware/auth.js'
import { csrfGuard } from '../middleware/csrf.js'
import { SiteSetting } from '../models/SiteSetting.js'

const router = Router()

const deliveryOptions = [
  { code: 'COD', name: 'Cash on Delivery (COD)', eta: '2–4 business days', note: `Free over ${config.currency.code} ${config.shipping.freeThreshold}` },
  { code: 'EXP', name: 'Express Air', eta: 'Coming Soon', note: 'Flat express rate' },
  { code: 'PIK', name: 'Self Pickup', eta: 'Coming Soon', note: 'Trade counter, no charge' },
  { code: 'FRT', name: 'Freight / LTL', eta: 'Coming Soon', note: 'Pallet & oversize' },
]

router.get('/delivery', (req, res) => res.json(deliveryOptions))

/* GET /api/meta/site — brand/company/currency/shipping config + LIVE counts.
   Replaces hardcoded company info and marketing stats in the storefront. */
router.get('/site', async (req, res, next) => {
  try {
    const [skuCount, categoryCount, tradeAccounts] = await Promise.all([
      Product.countDocuments({ status: 'live' }),
      Category.countDocuments({}),
      Order.distinct('customer.email').then((e) => e.length),
    ])
    res.json({
      company: config.company,
      currency: config.currency,
      shipping: config.shipping,
      marketing: config.marketing,
      // live, database-derived figures
      stats: { skuCount, categoryCount, tradeAccounts },
      copyrightYear: new Date().getUTCFullYear(),
    })
  } catch (e) { next(e) }
})

router.post('/subscribe', async (req, res, next) => {
  try {
    const { email } = req.body || {}
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' })
    }
    const { mailer } = await import('../services/mailer.js')
    await mailer.sendNewsletterWelcome(email)
    res.json({ success: true })
  } catch (e) { next(e) }
})

/* GET /api/meta/settings — SUPER_ADMIN only */
router.get('/settings', ...requireSuperAdmin, async (req, res, next) => {
  try {
    const list = await SiteSetting.find().lean()
    const settings = {}
    for (const item of list) {
      settings[item.key] = item.value
    }
    if (settings.adminAlertEmail === undefined) {
      settings.adminAlertEmail = config.company.email
    }
    res.json(settings)
  } catch (e) { next(e) }
})

/* POST /api/meta/settings — SUPER_ADMIN only */
router.post('/settings', ...requireSuperAdmin, csrfGuard, async (req, res, next) => {
  try {
    const { adminAlertEmail } = req.body || {}
    if (adminAlertEmail !== undefined) {
      await SiteSetting.updateOne(
        { key: 'adminAlertEmail' },
        { $set: { value: adminAlertEmail } },
        { upsert: true }
      )
    }
    res.json({ success: true })
  } catch (e) { next(e) }
})

export default router

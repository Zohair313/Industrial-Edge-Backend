import { Router } from 'express'
import crypto from 'crypto'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { requireSuperAdmin } from '../middleware/auth.js'
import { csrfGuard } from '../middleware/csrf.js'
import { ORDER_STATUS } from '../payments/constants.js'
import { mailer } from '../services/mailer.js'
import { applyVerifiedPayment } from '../services/orderPayments.js'
import { config, shippingFor } from '../config.js'

const router = Router()
const admin = [...requireSuperAdmin, csrfGuard]

/* Resolve the correct unit price for a given quantity from the
   product's own tier table — server-authoritative, so a tampered
   client price can never lower the charge. */
function priceForQty(product, qty) {
  const sorted = [...(product.tiers || [])].sort((a, b) => b.qty - a.qty)
  const tier = sorted.find((t) => qty >= t.qty)
  return tier ? tier.price : product.price
}

const newRef = () => `IE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/* POST /api/orders  — create a pending order from a cart.
   Body: { lines:[{sku, qty}], delivery, customer:{...} } */
router.post('/', async (req, res, next) => {
  try {
    const { lines = [], delivery = 'STD', customer = {} } = req.body || {}

    if (!Array.isArray(lines) || lines.length === 0)
      return res.status(400).json({ error: 'Cart is empty' })

    const required = ['name', 'email', 'address1', 'city', 'postal']
    for (const f of required)
      if (!customer[f] || !String(customer[f]).trim())
        return res.status(400).json({ error: `Missing required field: ${f}` })
    if (!isEmail(customer.email))
      return res.status(400).json({ error: 'Invalid email address' })

    // Rebuild every line from the database — ignore any client price.
    const resolved = []
    for (const line of lines) {
      const qty = Math.max(1, Math.floor(Number(line.qty) || 0))
      const product = await Product.findOne({ sku: line.sku }).lean()
      if (!product) return res.status(400).json({ error: `Unknown SKU: ${line.sku}` })
      if (product.status !== 'live') return res.status(400).json({ error: `Unavailable: ${line.sku}` })
      resolved.push({
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        price: priceForQty(product, qty),
        qty,
      })
    }

    const subtotal = resolved.reduce((s, l) => s + l.price * l.qty, 0)
    const shipping = shippingFor(delivery, subtotal)
    const total = subtotal + shipping

    // unique ref with a tiny retry in the astronomically unlikely clash
    let order
    for (let attempt = 0; attempt < 3 && !order; attempt++) {
      try {
        order = await Order.create({
          ref: newRef(),
          lines: resolved,
          delivery,
          customer,
          subtotal: Number(subtotal.toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          total: Number(total.toFixed(2)),
          status: ORDER_STATUS.PENDING_PAYMENT, // never created as paid
        })
      } catch (e) {
        if (e.code !== 11000) throw e
      }
    }
    if (!order) return res.status(500).json({ error: 'Could not allocate order reference' })

    // Optional, payment-safe acknowledgement (NOT a confirmation/receipt).
    mailer.sendPendingPaymentNotice(order).catch(() => {})
    mailer.sendAdminOrderNotification(order).catch(() => {})

    res.status(201).json(order.toJSON())
  } catch (e) { next(e) }
})

/* GET /api/orders  — admin list (newest first). SUPER_ADMIN only. */
router.get('/', requireSuperAdmin[0], requireSuperAdmin[1], async (req, res, next) => {
  try {
    const items = await Order.find().sort({ createdAt: -1 }).limit(config.pagination.ordersListMax).lean({ virtuals: true })
    res.json(items)
  } catch (e) { next(e) }
})

/* GET /api/orders/stats/overview — LIVE dashboard KPIs. SUPER_ADMIN only.
   Every figure is computed from the database, none are hardcoded. */
router.get('/stats/overview', requireSuperAdmin[0], requireSuperAdmin[1], async (req, res, next) => {
  try {
    const now = Date.now()
    const d30 = new Date(now - 30 * 864e5)
    const d60 = new Date(now - 60 * 864e5)
    const lowStock = config.inventory.lowStockThreshold

    const [rev30Agg, revPrevAgg, openOrders, activeSkus, lowStockCount] = await Promise.all([
      Order.aggregate([{ $match: { status: ORDER_STATUS.PAID, paymentDate: { $gte: d30 } } }, { $group: { _id: null, sum: { $sum: '$total' } } }]),
      Order.aggregate([{ $match: { status: ORDER_STATUS.PAID, paymentDate: { $gte: d60, $lt: d30 } } }, { $group: { _id: null, sum: { $sum: '$total' } } }]),
      Order.countDocuments({ status: { $in: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAYMENT_PROCESSING] } }),
      Product.countDocuments({ status: 'live' }),
      Product.countDocuments({ status: 'live', stock: { $lt: lowStock } }),
    ])

    const rev30 = rev30Agg[0]?.sum || 0
    const revPrev = revPrevAgg[0]?.sum || 0
    const delta = revPrev > 0 ? ((rev30 - revPrev) / revPrev) * 100 : null

    res.json({
      revenue30d: Number(rev30.toFixed(2)),
      revenueDeltaPct: delta == null ? null : Number(delta.toFixed(1)),
      openOrders,
      activeSkus,
      lowStock: lowStockCount,
      lowStockThreshold: lowStock,
      currency: config.currency,
    })
  } catch (e) { next(e) }
})

/* GET /api/orders/stats/activity — recent REAL events (orders + low stock).
   Replaces the hardcoded admin activity feed. SUPER_ADMIN only. */
router.get('/stats/activity', requireSuperAdmin[0], requireSuperAdmin[1], async (req, res, next) => {
  try {
    const recent = await Order.find().sort({ createdAt: -1 }).limit(8).lean()
    const events = recent.map((o) => ({
      at: o.paymentDate || o.updatedAt || o.createdAt,
      text: o.status === ORDER_STATUS.PAID ? 'Order paid' : o.status === ORDER_STATUS.CANCELLED ? 'Order cancelled' : 'Order placed',
      detail: `${o.ref} · ${o.customer?.company || o.customer?.name || ''}`.trim(),
      tag: o.status,
    }))
    const low = await Product.find({ status: 'live', stock: { $lt: config.inventory.lowStockThreshold } })
      .sort({ stock: 1 }).limit(3).lean()
    for (const p of low) events.push({ at: p.updatedAt, text: 'Low stock', detail: `${p.sku} (${p.name})`, tag: `${p.stock} LEFT` })
    events.sort((a, b) => new Date(b.at) - new Date(a.at))
    res.json(events.slice(0, 10))
  } catch (e) { next(e) }
})

/* GET /api/orders/stats/departments — paid revenue share per department.
   Powers the "Sales by Department" chart with real data. SUPER_ADMIN only. */
router.get('/stats/departments', requireSuperAdmin[0], requireSuperAdmin[1], async (req, res, next) => {
  try {
    const rows = await Order.aggregate([
      { $match: { status: ORDER_STATUS.PAID } },
      { $unwind: '$lines' },
      { $lookup: { from: 'products', localField: 'lines.sku', foreignField: 'sku', as: 'p' } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ['$p.category', 'other'] }, revenue: { $sum: { $multiply: ['$lines.price', '$lines.qty'] } } } },
      { $sort: { revenue: -1 } },
    ])
    res.json(rows.map((r) => ({ category: r._id, revenue: Number(r.revenue.toFixed(2)) })))
  } catch (e) { next(e) }
})

/* GET /api/orders/admin/customers — distinct customers derived from orders.
   (Customers are embedded in orders; this is the read view.) SUPER_ADMIN only. */
router.get('/admin/customers', requireSuperAdmin[0], requireSuperAdmin[1], async (req, res, next) => {
  try {
    const rows = await Order.aggregate([
      { $group: {
        _id: '$customer.email',
        name: { $last: '$customer.name' },
        company: { $last: '$customer.company' },
        orders: { $sum: 1 },
        spent: { $sum: '$total' },
        lastOrder: { $max: '$createdAt' },
      } },
      { $sort: { spent: -1 } },
    ])
    res.json(rows.filter((r) => r._id).map((r) => ({ email: r._id, name: r.name, company: r.company, orders: r.orders, spent: Number(r.spent.toFixed(2)), lastOrder: r.lastOrder })))
  } catch (e) { next(e) }
})

/* PATCH /api/orders/:ref  { status } — admin status update. SUPER_ADMIN only.
   Deliberately CANNOT set PAID or REFUNDED: those are reachable only through
   the verified payment / refund flows. Admins may CANCEL an unsettled order. */
router.patch('/:ref', ...admin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '')
    if (status !== ORDER_STATUS.CANCELLED)
      return res.status(400).json({ error: 'Admins may only CANCEL an order. PAID/REFUNDED require the verified payment flow.' })

    const order = await Order.findOne({ ref: req.params.ref })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.status === ORDER_STATUS.PAID || order.status === ORDER_STATUS.REFUNDED)
      return res.status(409).json({ error: `Cannot cancel a ${order.status} order` })

    order.status = ORDER_STATUS.CANCELLED
    await order.save()
    res.json(order.toJSON())
  } catch (e) { next(e) }
})

/* POST /api/orders/:ref/confirm — confirm order (mark as PAID). SUPER_ADMIN only. */
router.post('/:ref/confirm', requireSuperAdmin[0], requireSuperAdmin[1], async (req, res, next) => {
  try {
    const order = await Order.findOne({ ref: req.params.ref })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    await applyVerifiedPayment(order, { verified: true, provider: 'MANUAL_CONFIRM', reference: 'Admin Manual Confirmation' })
    res.json(order.toJSON())
  } catch (e) { next(e) }
})

/* GET /api/orders/:ref — public route to retrieve order details for payment/confirmation */
router.get('/:ref', async (req, res, next) => {
  try {
    const order = await Order.findOne({ ref: req.params.ref })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    res.json(order.toJSON())
  } catch (e) { next(e) }
})

export default router

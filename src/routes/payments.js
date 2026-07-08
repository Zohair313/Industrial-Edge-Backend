import { Router } from 'express'
import { Order } from '../models/Order.js'
import { paymentService } from '../payments/PaymentService.js'
import { NotConfiguredError, ORDER_STATUS } from '../payments/constants.js'
import { applyVerifiedPayment, markPaymentFailed, markProcessing, logEvent } from '../services/orderPayments.js'
import { requireSuperAdmin } from '../middleware/auth.js'
import { csrfGuard } from '../middleware/csrf.js'

const router = Router()
const NOT_CONFIGURED_MSG = 'Payment gateway is currently awaiting merchant configuration.'

const publicOrder = (o) => ({
  ref: o.ref,
  status: o.status,
  paymentStatus: o.paymentStatus,
  paymentProvider: o.paymentProvider,
  transactionId: o.transactionId,
  providerReference: o.providerReference,
  paymentDate: o.paymentDate,
  invoice: o.invoice,
  total: o.total,
})

/* GET /api/payments/methods — available providers + configuration status. */
router.get('/methods', (req, res) => {
  res.json({ methods: paymentService.list(), anyConfigured: paymentService.anyConfigured() })
})

/* GET /api/payments/:ref/status — backend-authoritative status the
   frontend polls. The frontend must NEVER assume success on its own. */
router.get('/:ref/status', async (req, res, next) => {
  try {
    const order = await Order.findOne({ ref: req.params.ref }).lean()
    if (!order) return res.status(404).json({ error: 'Order not found' })
    res.json(publicOrder(order))
  } catch (e) { next(e) }
})

/* POST /api/payments/:ref/initiate  { provider }
   Begins a payment attempt. With no credentials this returns NOT_CONFIGURED
   and leaves the order PENDING_PAYMENT — it can never short-circuit to PAID. */
router.post('/:ref/initiate', async (req, res, next) => {
  try {
    const provider = paymentService.get(req.body?.provider)
    if (!provider) return res.status(400).json({ error: 'Unknown payment provider' })

    const order = await Order.findOne({ ref: req.params.ref })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAYMENT_FAILED].includes(order.status))
      return res.status(409).json({ error: `Order is ${order.status}; cannot initiate payment` })

    if (!provider.isConfigured()) {
      logEvent(order, { provider: provider.id, event: 'initiate', verified: false, outcome: 'NOT_CONFIGURED' })
      await order.save()
      return res.status(503).json({ error: NOT_CONFIGURED_MSG, code: 'NOT_CONFIGURED', provider: provider.id })
    }

    if (provider.id === 'COD') {
      await applyVerifiedPayment(order, {
        verified: true,
        provider: 'COD',
        transactionId: `COD-${Date.now()}`,
        reference: 'Cash on Delivery',
      })
      return res.json({ status: order.status, handoff: null })
    }

    // Configured path (dormant until credentials exist).
    await markProcessing(order, provider.id)
    const handoff = await provider.createPayment(order) // returns redirect/form data
    res.json({ status: order.status, handoff })
  } catch (e) {
    if (e instanceof NotConfiguredError)
      return res.status(503).json({ error: NOT_CONFIGURED_MSG, code: 'NOT_CONFIGURED', provider: e.provider })
    next(e)
  }
})

/* POST /api/payments/webhook/:provider — asynchronous gateway callback.
   Signature is verified by the provider; an order reaches PAID ONLY when the
   callback is genuinely verified AND reports success. Forged/unverified
   callbacks are logged and rejected with no status change. */
router.post('/webhook/:provider', async (req, res, next) => {
  try {
    const provider = paymentService.get(req.params.provider)
    if (!provider) return res.status(404).json({ error: 'Unknown payment provider' })

    if (!provider.isConfigured()) {
      console.warn(`[webhook:${provider.id}] received but provider NOT_CONFIGURED — ignoring`)
      return res.status(503).json({ error: 'NOT_CONFIGURED', provider: provider.id })
    }

    let result
    try {
      result = await provider.handleWebhook(req)
    } catch (e) {
      if (e instanceof NotConfiguredError) return res.status(503).json({ error: 'NOT_CONFIGURED' })
      throw e
    }

    const order = await resolveOrder(result?.raw)

    // Reject anything that did not cryptographically verify.
    if (!result?.verified) {
      console.warn(`[webhook:${provider.id}] signature verification FAILED — rejected`)
      if (order) { logEvent(order, { provider: provider.id, event: 'webhook', verified: false, outcome: 'REJECTED', raw: result?.raw }); await order.save() }
      return res.status(400).json({ error: 'Signature verification failed' })
    }

    if (!order) return res.status(404).json({ error: 'Order not found for callback' })

    if (result.status === 'SUCCESS') {
      await applyVerifiedPayment(order, { ...result, provider: provider.id })
    } else {
      await markPaymentFailed(order, { provider: provider.id, raw: result.raw, detail: 'Gateway reported failure' })
    }
    res.json({ ok: true, ref: order.ref, status: order.status })
  } catch (e) { next(e) }
})

/* POST /api/payments/:ref/refund — SUPER_ADMIN. Refund flow (dormant until
   credentials exist). Only a PAID order can be refunded. */
router.post('/:ref/refund', ...requireSuperAdmin, csrfGuard, async (req, res, next) => {
  try {
    const order = await Order.findOne({ ref: req.params.ref })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.status !== ORDER_STATUS.PAID) return res.status(409).json({ error: 'Only PAID orders can be refunded' })

    const provider = paymentService.get(order.paymentProvider)
    if (!provider) return res.status(400).json({ error: 'Order has no payment provider' })

    try {
      const result = await provider.refundPayment(order, order.total)
      order.status = ORDER_STATUS.REFUNDED
      order.paymentStatus = 'REFUNDED'
      order.refundDate = new Date()
      order.refundReference = result?.reference || null
      logEvent(order, { provider: provider.id, event: 'refund', verified: true, outcome: 'REFUNDED', raw: result })
      await order.save()
      res.json(order.toJSON())
    } catch (e) {
      if (e instanceof NotConfiguredError)
        return res.status(503).json({ error: NOT_CONFIGURED_MSG, code: 'NOT_CONFIGURED', provider: provider.id })
      throw e
    }
  } catch (e) { next(e) }
})

/* Find the order a callback refers to, across provider-specific field names. */
async function resolveOrder(raw = {}) {
  const ref = raw.ref || raw.pp_BillReference || raw.billReference || raw.orderId ||
    raw.orderRefNum || raw.ORDER_REF_NUMBER || raw.merchantOrderId
  if (!ref) return null
  return Order.findOne({ ref })
}

export default router

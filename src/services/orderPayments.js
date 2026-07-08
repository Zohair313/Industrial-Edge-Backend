import { ORDER_STATUS, PAYMENT_STATUS } from '../payments/constants.js'
import { mailer } from './mailer.js'
import { generateInvoice } from './invoice.js'

/**
 * The ONLY function in the codebase that moves an order to PAID. It refuses to
 * do so unless handed an already-verified provider result, and it bundles the
 * post-payment side-effects (invoice + emails) so they can never happen
 * without a real payment.
 *
 * @param {Order} order   a Mongoose order document
 * @param {{verified:boolean, provider:string, transactionId?:string, reference?:string, raw?:any}} result
 */
export async function applyVerifiedPayment(order, result) {
  // Defence-in-depth: never trust a caller that didn't actually verify.
  if (!result?.verified) throw new Error('Refusing to mark order paid: payment not verified')

  // Idempotent: a duplicate/late webhook for an already-paid order is a no-op.
  if (order.status === ORDER_STATUS.PAID) return order

  // Only a not-yet-settled order may transition to PAID.
  if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAYMENT_PROCESSING].includes(order.status)) {
    throw new Error(`Cannot mark ${order.ref} paid from status ${order.status}`)
  }

  order.status = ORDER_STATUS.PAID
  order.paymentStatus = PAYMENT_STATUS.SUCCESS
  order.paymentProvider = result.provider
  order.transactionId = result.transactionId || null
  order.providerReference = result.reference || null
  order.paymentDate = new Date()
  order.invoice = generateInvoice(order) // requires status === PAID (already set)

  logEvent(order, { provider: result.provider, event: 'payment-verified', verified: true, outcome: 'SUCCESS', raw: result.raw })
  await order.save()

  // Side-effects strictly AFTER verified PAID + persistence.
  mailer.sendOrderConfirmation(order).catch(() => {})
  mailer.sendInvoice(order).catch(() => {})
  return order
}

/** Record a verified-but-failed payment. Never downgrades a PAID order. */
export async function markPaymentFailed(order, { provider, raw, detail } = {}) {
  if (order.status === ORDER_STATUS.PAID) return order
  order.status = ORDER_STATUS.PAYMENT_FAILED
  order.paymentStatus = PAYMENT_STATUS.FAILED
  if (provider) order.paymentProvider = provider
  logEvent(order, { provider, event: 'payment-failed', verified: true, outcome: 'FAILED', detail, raw })
  await order.save()
  return order
}

/** Mark that a payment attempt has been initiated (pre-confirmation). */
export async function markProcessing(order, provider) {
  if (order.status === ORDER_STATUS.PAID) return order
  order.status = ORDER_STATUS.PAYMENT_PROCESSING
  order.paymentStatus = PAYMENT_STATUS.PROCESSING
  order.paymentProvider = provider
  logEvent(order, { provider, event: 'initiate', verified: false, outcome: 'PROCESSING' })
  await order.save()
  return order
}

/** Append an entry to the order's append-only audit trail. */
export function logEvent(order, { provider, event, verified = false, outcome, detail, raw } = {}) {
  order.webhookLogs.push({
    at: new Date(), provider, event, verified, outcome, detail,
    raw: raw ? safeRaw(raw) : undefined,
  })
}

// Keep audit payloads small and free of anything sensitive.
function safeRaw(raw) {
  try {
    const json = JSON.parse(JSON.stringify(raw))
    return JSON.parse(JSON.stringify(json).slice(0, 4000))
  } catch { return undefined }
}

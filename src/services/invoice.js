import { ORDER_STATUS } from '../payments/constants.js'

/**
 * Invoice generation. Produces an invoice number + timestamp; a PDF renderer
 * (pdfkit / puppeteer) plugs in here later. Hard-guarded: refuses to issue an
 * invoice for anything other than a PAID order.
 */
export function generateInvoice(order) {
  if (order.status !== ORDER_STATUS.PAID) {
    throw new Error(`Cannot issue invoice for order ${order.ref}: status is ${order.status}`)
  }
  if (order.invoice?.number) return order.invoice // idempotent
  const year = new Date().getUTCFullYear()
  return { number: `INV-${year}-${order.ref.replace(/^IE-/, '')}`, issuedAt: new Date() }
}

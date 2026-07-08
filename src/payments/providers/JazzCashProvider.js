import crypto from 'crypto'
import { BaseProvider } from './BaseProvider.js'
import { PAYMENT_STATUS } from '../constants.js'

/**
 * JazzCash (Mobile Account / Card) integration.
 * Secure-hash scheme: HMAC-SHA256 over all non-empty `pp_*` params sorted by
 * key, joined with '&', prefixed by the Integrity Salt. Live values land in
 * `pp_SecureHash`. This is implemented for real — it simply cannot return a
 * positive verification until the Integrity Salt (a credential) is present.
 */
export class JazzCashProvider extends BaseProvider {
  constructor() {
    super('JAZZCASH', {
      merchantId: process.env.JAZZCASH_MERCHANT_ID || '',
      password: process.env.JAZZCASH_PASSWORD || '',
      integritySalt: process.env.JAZZCASH_INTEGRITY_SALT || '',
    })
  }

  isConfigured() {
    const { merchantId, password, integritySalt } = this.config
    return Boolean(merchantId && password && integritySalt)
  }

  /** Compute the JazzCash secure hash for a set of params. */
  computeSecureHash(params) {
    const sorted = Object.keys(params)
      .filter((k) => k.startsWith('pp_') && k !== 'pp_SecureHash' && params[k] !== '' && params[k] != null)
      .sort()
      .map((k) => params[k])
    const message = [this.config.integritySalt, ...sorted].join('&')
    return crypto.createHmac('sha256', this.config.integritySalt).update(message).digest('hex').toUpperCase()
  }

  async createPayment(order) {
    this.ensureConfigured()
    // Build pp_* params, attach computeSecureHash(params), return the hosted
    // checkout URL + form fields for the browser to POST to JazzCash.
    throw new Error('JAZZCASH.createPayment: implement hosted-checkout handoff once credentials exist')
  }

  async verifyPayment(params) {
    this.ensureConfigured()
    const provided = String(params?.pp_SecureHash || '').toUpperCase()
    const expected = this.computeSecureHash(params)
    // Length guard first — timingSafeEqual throws on unequal-length buffers.
    const verified = provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    return {
      verified,
      status: params?.pp_ResponseCode === '000' ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.FAILED,
      transactionId: params?.pp_TxnRefNo,
      reference: params?.pp_RetreivalReferenceNo,
      raw: params,
    }
  }

  async handleWebhook(req) {
    this.ensureConfigured()
    return this.verifyPayment(req.body || {})
  }

  async refundPayment(/* order, amount */) {
    this.ensureConfigured()
    throw new Error('JAZZCASH.refundPayment: implement Refund API call once credentials exist')
  }

  async getTransactionStatus(/* transactionId */) {
    this.ensureConfigured()
    throw new Error('JAZZCASH.getTransactionStatus: implement Status Inquiry API once credentials exist')
  }
}

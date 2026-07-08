import crypto from 'crypto'
import { BaseProvider } from './BaseProvider.js'
import { PAYMENT_STATUS } from '../constants.js'

/**
 * Easypaisa (Telenor Microfinance) integration.
 * Signature scheme: SHA-256 hash of the request params (sorted, joined with
 * '&') concatenated with the merchant Hash Key. Implemented for real; returns
 * a positive verification only when the Hash Key is configured AND matches.
 */
export class EasypaisaProvider extends BaseProvider {
  constructor() {
    super('EASYPAISA', {
      merchantId: process.env.EASYPAISA_MERCHANT_ID || '',
      storeId: process.env.EASYPAISA_STORE_ID || '',
      hashKey: process.env.EASYPAISA_HASH_KEY || '',
    })
  }

  isConfigured() {
    const { storeId, hashKey } = this.config
    return Boolean(storeId && hashKey)
  }

  computeHash(params) {
    const sorted = Object.keys(params)
      .filter((k) => k !== 'merchantHashedReq' && k !== 'signature' && params[k] !== '' && params[k] != null)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')
    return crypto.createHash('sha256').update(sorted + this.config.hashKey).digest('hex')
  }

  async createPayment(order) {
    this.ensureConfigured()
    throw new Error('EASYPAISA.createPayment: implement Mobile Account / hosted checkout once credentials exist')
  }

  async verifyPayment(params) {
    this.ensureConfigured()
    const provided = String(params?.signature || params?.merchantHashedReq || '')
    const expected = this.computeHash(params)
    const verified = Boolean(provided) && provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    return {
      verified,
      status: String(params?.responseCode) === '0000' ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.FAILED,
      transactionId: params?.transactionId || params?.orderId,
      reference: params?.transactionReference,
      raw: params,
    }
  }

  async handleWebhook(req) {
    this.ensureConfigured()
    return this.verifyPayment(req.body || {})
  }

  async refundPayment(/* order, amount */) {
    this.ensureConfigured()
    throw new Error('EASYPAISA.refundPayment: implement Refund API once credentials exist')
  }

  async getTransactionStatus(/* transactionId */) {
    this.ensureConfigured()
    throw new Error('EASYPAISA.getTransactionStatus: implement Inquiry API once credentials exist')
  }
}

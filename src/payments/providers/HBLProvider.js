import crypto from 'crypto'
import { BaseProvider } from './BaseProvider.js'
import { PAYMENT_STATUS } from '../constants.js'

/**
 * HBL (HBLPay) integration.
 * HBLPay's production handshake uses RSA/AES envelope encryption; the exact
 * callback verification is provided in HBL's onboarding kit. Here we expose
 * an HMAC-SHA256 verification framework over the raw callback body against a
 * shared secret + signature header — swap in HBL's real scheme at integration
 * time. Until the secret exists, verification can only return false.
 */
export class HBLProvider extends BaseProvider {
  constructor() {
    super('HBL', {
      merchantId: process.env.HBL_MERCHANT_ID || '',
      apiKey: process.env.HBL_API_KEY || '',
      secret: process.env.HBL_SECRET || '',
    })
  }

  isConfigured() {
    const { merchantId, apiKey, secret } = this.config
    return Boolean(merchantId && apiKey && secret)
  }

  /** HMAC-SHA256 of the exact raw request body (placeholder scheme). */
  computeSignature(rawBody) {
    return crypto.createHmac('sha256', this.config.secret).update(rawBody || '').digest('hex')
  }

  async createPayment(order) {
    this.ensureConfigured()
    throw new Error('HBL.createPayment: implement HBLPay session request once credentials exist')
  }

  async verifyPayment(params) {
    this.ensureConfigured()
    throw new Error('HBL.verifyPayment: implement HBLPay decryption/verify once credentials exist')
  }

  async handleWebhook(req) {
    this.ensureConfigured()
    const signature = String(req.get?.('x-hbl-signature') || req.headers?.['x-hbl-signature'] || '')
    const raw = req.rawBody || JSON.stringify(req.body || {})
    const expected = this.computeSignature(raw)
    const verified = Boolean(signature) && signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    const body = req.body || {}
    return {
      verified,
      status: String(body.RESPONSE_CODE) === '0' ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.FAILED,
      transactionId: body.TRANSACTION_ID || body.ORDER_REF_NUMBER,
      reference: body.REFERENCE_NUMBER,
      raw: body,
    }
  }

  async refundPayment(/* order, amount */) {
    this.ensureConfigured()
    throw new Error('HBL.refundPayment: implement HBLPay refund once credentials exist')
  }

  async getTransactionStatus(/* transactionId */) {
    this.ensureConfigured()
    throw new Error('HBL.getTransactionStatus: implement HBLPay inquiry once credentials exist')
  }
}

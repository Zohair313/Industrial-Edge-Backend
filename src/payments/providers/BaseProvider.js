import { NotConfiguredError, PROVIDER_CONFIG_STATUS } from '../constants.js'

/**
 * Abstract payment provider. Concrete providers (HBL, JazzCash, Easypaisa)
 * extend this and implement the real gateway calls.
 *
 * SAFETY CONTRACT — enforced here so no subclass can violate it:
 *  - Every money-moving / verification method calls `ensureConfigured()` first.
 *    With no credentials the call throws NotConfiguredError; it can NEVER
 *    return a "success".
 *  - `verifyWebhook()` returns a structured result and defaults to
 *    { verified:false }. A subclass must prove a signature match to flip it.
 */
export class BaseProvider {
  /** @param {string} id  provider id (e.g. 'HBL')  @param {object} config */
  constructor(id, config = {}) {
    this.id = id
    this.config = config
  }

  /** Must be overridden: true only when all required secrets are present. */
  isConfigured() {
    return false
  }

  status() {
    return this.isConfigured() ? PROVIDER_CONFIG_STATUS.CONFIGURED : PROVIDER_CONFIG_STATUS.NOT_CONFIGURED
  }

  ensureConfigured() {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id)
  }

  // ---- contract (subclasses override the body AFTER ensureConfigured) ----

  /** Begin a payment; returns provider redirect/handoff data. */
  async createPayment(/* order */) {
    this.ensureConfigured()
    throw new Error(`${this.id}.createPayment not implemented`)
  }

  /** Verify a payment result returned/redirected from the gateway. */
  async verifyPayment(/* params */) {
    this.ensureConfigured()
    throw new Error(`${this.id}.verifyPayment not implemented`)
  }

  /** Verify + parse an async webhook/IPN callback.
   *  @returns {{verified:boolean, status?:string, transactionId?:string, reference?:string, raw?:any}} */
  async handleWebhook(/* req */) {
    this.ensureConfigured()
    return { verified: false }
  }

  /** Issue a refund against a previously captured transaction. */
  async refundPayment(/* order, amount */) {
    this.ensureConfigured()
    throw new Error(`${this.id}.refundPayment not implemented`)
  }

  /** Query the gateway for the authoritative status of a transaction. */
  async getTransactionStatus(/* transactionId */) {
    this.ensureConfigured()
    throw new Error(`${this.id}.getTransactionStatus not implemented`)
  }
}

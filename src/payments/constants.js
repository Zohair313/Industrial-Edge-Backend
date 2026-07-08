/* Single source of truth for payment-related enums. Shared by the Order
   model, the provider layer, the routes and the admin API. */

// Order lifecycle. The ONLY terminal "money received" state is PAID, and it
// is reachable solely through a verified provider confirmation.
export const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  PAID: 'PAID',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
}
export const ORDER_STATUSES = Object.values(ORDER_STATUS)

// Provider-facing payment status stored alongside the order.
export const PAYMENT_STATUS = {
  NOT_INITIATED: 'NOT_INITIATED',
  INITIATED: 'INITIATED',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
}
export const PAYMENT_STATUSES = Object.values(PAYMENT_STATUS)

export const PROVIDERS = {
  HBL: 'HBL',
  JAZZCASH: 'JAZZCASH',
  EASYPAISA: 'EASYPAISA',
  COD: 'COD',
}
export const PROVIDER_IDS = Object.values(PROVIDERS)

export const PROVIDER_CONFIG_STATUS = {
  CONFIGURED: 'CONFIGURED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
}

// Legacy → new status map for one-time migration of pre-existing orders.
export const LEGACY_STATUS_MAP = {
  pending: ORDER_STATUS.PENDING_PAYMENT,
  paid: ORDER_STATUS.PAID,
  cancelled: ORDER_STATUS.CANCELLED,
}

/* A typed error used everywhere a provider cannot act because it lacks
   credentials. It is NEVER swallowed into a success. */
export class NotConfiguredError extends Error {
  constructor(provider) {
    super(`Payment provider ${provider} is not configured`)
    this.name = 'NotConfiguredError'
    this.code = 'NOT_CONFIGURED'
    this.status = 503
    this.provider = provider
  }
}

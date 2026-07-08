import { HBLProvider } from './providers/HBLProvider.js'
import { JazzCashProvider } from './providers/JazzCashProvider.js'
import { EasypaisaProvider } from './providers/EasypaisaProvider.js'
import { CODProvider } from './providers/CODProvider.js'
import { PROVIDERS } from './constants.js'

/**
 * Central registry + dispatcher for payment providers. The rest of the app
 * never instantiates a provider directly — it asks the service, so the
 * abstraction (and the safety contract) is enforced in one place.
 */
class PaymentService {
  constructor() {
    this.providers = {
      [PROVIDERS.HBL]: new HBLProvider(),
      [PROVIDERS.JAZZCASH]: new JazzCashProvider(),
      [PROVIDERS.EASYPAISA]: new EasypaisaProvider(),
      [PROVIDERS.COD]: new CODProvider(),
    }
    this.labels = {
      [PROVIDERS.HBL]: 'HBL',
      [PROVIDERS.JAZZCASH]: 'JazzCash',
      [PROVIDERS.EASYPAISA]: 'Easypaisa',
      [PROVIDERS.COD]: 'Cash on Delivery (COD)',
    }
  }

  /** @returns provider instance, or null for an unknown id. */
  get(id) {
    return this.providers[String(id || '').toUpperCase()] || null
  }

  /** Public-safe list of methods + whether each is configured. */
  list() {
    return Object.entries(this.providers).map(([id, p]) => ({
      id,
      label: this.labels[id],
      status: p.status(),
      configured: p.isConfigured(),
    }))
  }

  anyConfigured() {
    return Object.values(this.providers).some((p) => p.isConfigured())
  }
}

export const paymentService = new PaymentService()

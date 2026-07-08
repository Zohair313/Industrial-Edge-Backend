import { BaseProvider } from './BaseProvider.js'
import { PROVIDER_CONFIG_STATUS } from '../constants.js'

export class CODProvider extends BaseProvider {
  constructor() {
    super('COD', {})
  }

  isConfigured() {
    return true
  }

  status() {
    return PROVIDER_CONFIG_STATUS.CONFIGURED
  }

  async createPayment(order) {
    this.ensureConfigured()
    return { handoff: null }
  }
}

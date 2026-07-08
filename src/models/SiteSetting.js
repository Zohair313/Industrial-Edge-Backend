import { createCollection } from '../localStore.js'

export const SiteSetting = createCollection('site_settings', {
  uniqueFields: ['key'],
})

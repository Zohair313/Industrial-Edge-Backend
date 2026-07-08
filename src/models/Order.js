import { createCollection } from '../localStore.js'

export const Order = createCollection('orders', {
  uniqueFields: ['ref'],
})

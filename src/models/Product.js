import { createCollection } from '../localStore.js'

export const Product = createCollection('products', {
  uniqueFields: ['sku'],
})

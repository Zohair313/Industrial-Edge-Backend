import { createCollection } from '../localStore.js'

export const Category = createCollection('categories', {
  uniqueFields: ['slug'],
})

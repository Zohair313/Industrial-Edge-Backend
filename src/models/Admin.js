import { createCollection } from '../localStore.js'

export const ROLES = ['SUPER_ADMIN']

export const Admin = createCollection('admins', {
  uniqueFields: ['email'],
  toJSON: {
    transform: (_doc, ret) => {
      delete ret.passwordHash
      delete ret.__v
      return ret
    },
  },
})

// Static method
Admin.hashPassword = async function (plain) {
  const bcrypt = await import('bcryptjs')
  return bcrypt.default.hash(plain, 12)
}

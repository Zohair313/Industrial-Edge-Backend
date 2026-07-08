import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

export const ROLES = ['SUPER_ADMIN']

const AdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'SUPER_ADMIN' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
)

// Never serialise the hash.
AdminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    delete ret.__v
    return ret
  },
})

AdminSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash)
}

AdminSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 12)
}

export const Admin = mongoose.model('Admin', AdminSchema)

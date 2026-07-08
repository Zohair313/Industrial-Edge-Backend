import { Admin } from './models/Admin.js'

/* Ensure a SUPER_ADMIN exists. Credentials come from the environment;
   a clearly-labelled default is used only outside production so the
   dashboard is reachable on first boot during development. */
export async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@industrialedge.local').toLowerCase()
  const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'changeme123')
  const name = process.env.ADMIN_NAME || 'Site Owner'

  if (!password) {
    console.warn('• No ADMIN_PASSWORD set in production — skipping admin seed')
    return { skipped: true }
  }

  const existing = await Admin.findOne({ email })
  if (existing) {
    // If an explicit ADMIN_PASSWORD is configured and differs from what's
    // stored, sync it — .env is the source of truth for the bootstrap account.
    if (process.env.ADMIN_PASSWORD) {
      const matches = await existing.verifyPassword(password)
      if (!matches) {
        existing.passwordHash = await Admin.hashPassword(password)
        await existing.save()
        console.log(`• Updated SUPER_ADMIN password from ADMIN_PASSWORD → ${email}`)
        return { skipped: false, updated: true, email }
      }
    }
    return { skipped: true, email }
  }

  await Admin.create({
    email,
    name,
    role: 'SUPER_ADMIN',
    passwordHash: await Admin.hashPassword(password),
  })
  console.log(`• Seeded SUPER_ADMIN → ${email}${process.env.ADMIN_PASSWORD ? '' : ' (dev default password)'}`)
  return { skipped: false, email }
}

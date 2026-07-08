import { Order } from './models/Order.js'
import { LEGACY_STATUS_MAP, ORDER_STATUS, PAYMENT_STATUS } from './payments/constants.js'

/* One-time, idempotent migration of orders created under the old status
   vocabulary ('pending'/'paid'/'cancelled') to the new payment state machine.
   Safe to run on every boot. */
export async function migrateOrderStatuses() {
  let migrated = 0
  for (const [legacy, next] of Object.entries(LEGACY_STATUS_MAP)) {
    const set = { status: next }
    if (next === ORDER_STATUS.PAID) set.paymentStatus = PAYMENT_STATUS.SUCCESS
    const r = await Order.updateMany({ status: legacy }, { $set: set })
    migrated += r.modifiedCount || 0
  }
  if (migrated) console.log(`• Migrated ${migrated} legacy order status value(s)`)
  return migrated
}

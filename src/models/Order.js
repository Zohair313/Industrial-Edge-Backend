import mongoose from 'mongoose'
import { ORDER_STATUSES, ORDER_STATUS, PAYMENT_STATUSES, PAYMENT_STATUS, PROVIDER_IDS } from '../payments/constants.js'

/* A single ordered line — snapshotted at order time so later price
   or name changes never mutate historical orders. */
const OrderLineSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, default: 'ea' },
    price: { type: Number, required: true, min: 0 }, // unit price at order time
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
)

const CustomerSchema = new mongoose.Schema(
  {
    company: { type: String, trim: true, maxlength: 160 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 40 },
    address1: { type: String, required: true, trim: true, maxlength: 200 },
    address2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    region: { type: String, trim: true, maxlength: 120 },
    postal: { type: String, required: true, trim: true, maxlength: 40 },
    country: { type: String, default: 'PK', trim: true, maxlength: 80 },
  },
  { _id: false }
)

/* Append-only audit trail of every payment/webhook event seen for an order. */
const WebhookLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    provider: { type: String },
    event: { type: String },         // e.g. 'webhook', 'initiate', 'refund'
    verified: { type: Boolean, default: false },
    outcome: { type: String },       // SUCCESS | FAILED | REJECTED | NOT_CONFIGURED
    detail: { type: String },
    raw: { type: mongoose.Schema.Types.Mixed }, // redacted gateway payload
  },
  { _id: true }
)

const OrderSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, unique: true, index: true },
    lines: { type: [OrderLineSchema], required: true, validate: (v) => v.length > 0 },
    delivery: { type: String, default: 'STD' },
    customer: { type: CustomerSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },

    // Order lifecycle — PAID is reachable ONLY via verified provider confirmation.
    status: { type: String, enum: ORDER_STATUSES, default: ORDER_STATUS.PENDING_PAYMENT, index: true },

    // ---- payment audit fields ----
    paymentProvider: { type: String, enum: [...PROVIDER_IDS, null], default: null },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: PAYMENT_STATUS.NOT_INITIATED, index: true },
    transactionId: { type: String, default: null },     // gateway txn id
    providerReference: { type: String, default: null }, // retrieval / reference number
    paymentDate: { type: Date, default: null },
    refundDate: { type: Date, default: null },
    refundReference: { type: String, default: null },
    invoice: {
      number: { type: String, default: null },
      issuedAt: { type: Date, default: null },
    },
    webhookLogs: { type: [WebhookLogSchema], default: [] },
  },
  { timestamps: true }
)

OrderSchema.set('toJSON', { virtuals: true })

export const Order = mongoose.model('Order', OrderSchema)

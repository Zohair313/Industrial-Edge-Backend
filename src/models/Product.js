import mongoose from 'mongoose'

const TierSchema = new mongoose.Schema(
  { qty: { type: Number, required: true }, price: { type: Number, required: true } },
  { _id: false }
)

const ProductSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 4000 },
    images: { type: [String], default: [] }, // image URLs
    category: { type: String, required: true, index: true }, // category slug
    glyph: { type: String, default: 'fastener' },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'ea' },
    moq: { type: Number, default: 1 },
    stock: { type: Number, default: 0 },
    lead: { type: String, default: 'Ships today' },
    tags: { type: [String], default: [] },
    tiers: { type: [TierSchema], default: [] },
    status: { type: String, enum: ['live', 'draft', 'archived', 'coming-soon'], default: 'live', index: true },
    featured: { type: Boolean, default: false, index: true },

    // DYNAMIC spec map — keys differ per category. This is the
    // heterogeneous attribute store the spec calls for.
    specs: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
)

// text index for keyword search across sku + name
ProductSchema.index({ sku: 'text', name: 'text' })

// stable public id used by the frontend routes
ProductSchema.virtual('id').get(function () {
  return this.sku
})
ProductSchema.set('toJSON', { virtuals: true })

export const Product = mongoose.model('Product', ProductSchema)

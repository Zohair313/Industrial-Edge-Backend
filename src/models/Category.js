import mongoose from 'mongoose'

/* A custom field definition — the dynamic-schema primitive.
   The client defines these per category from the CMS. */
const FieldSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    type: { type: String, enum: ['text', 'number', 'dimension', 'select', 'boolean'], default: 'text' },
    unit: { type: String },
    options: [{ type: String }],
  },
  { _id: true }
)

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    blurb: { type: String, default: '' },
    parent: { type: String, default: null, index: true }, // parent slug, null = top level
    count: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    fields: { type: [FieldSchema], default: [] },
  },
  { timestamps: true }
)

export const Category = mongoose.model('Category', CategorySchema)

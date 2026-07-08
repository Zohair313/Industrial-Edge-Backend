import { fileURLToPath } from 'url'
import { Category } from './models/Category.js'
import { Product } from './models/Product.js'

const categories = [
  { id: 'smartphones', name: 'Smartphones & Mobiles', code: 'SP', count: 120, blurb: 'Flagship phones, budget models & rugged devices' },
  { id: 'laptops', name: 'Laptops & Computers', code: 'LP', count: 85, blurb: 'High-performance work laptops, ultrabooks & gaming rigs' },
  { id: 'audio', name: 'Audio & Headphones', code: 'AD', count: 150, blurb: 'Noise-cancelling headphones, earbuds & home audio' },
  { id: 'smartwatch', name: 'Smartwatches & Wearables', code: 'SW', count: 64, blurb: 'Fitness trackers, smartwatches & health monitors' },
  { id: 'accessories', name: 'Accessories & Chargers', code: 'AC', count: 320, blurb: 'Fast chargers, USB-C hubs & power banks' },
]

const products = [
  {
    id: 'SP-15PM', sku: 'SP-15PM-BLK', name: 'iPhone 15 Pro Max — 256GB Titanium', category: 'smartphones', glyph: 'electrical',
    price: 1199.00, unit: 'ea', moq: 1, stock: 45, lead: 'Ships today', tags: ['Apple', '5G', 'Titanium'],
    images: ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=80'],
    description: 'The ultimate iPhone experience.',
    tiers: [{ qty: 1, price: 1199.00 }, { qty: 5, price: 1149.00 }, { qty: 10, price: 1099.00 }],
    specs: { 'Screen Size': '6.7 inches', 'Processor': 'A17 Pro Chip', 'Storage': '256 GB', 'Camera': '48 MP Main', 'OS': 'iOS 17', 'Weight': '221 g' },
  },
  {
    id: 'LP-MBP16', sku: 'LP-MBP16-SLV', name: 'MacBook Pro 16" — M3 Max / 36GB / 1TB', category: 'laptops', glyph: 'handling',
    price: 3499.00, unit: 'ea', moq: 1, stock: 12, lead: 'Ships today', tags: ['Apple', 'M3 Max', 'Retina'],
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=80'],
    description: 'The MacBook Pro blasts forward with M3 Max.',
    tiers: [{ qty: 1, price: 3499.00 }, { qty: 3, price: 3399.00 }, { qty: 5, price: 3299.00 }],
    specs: { 'Screen Size': '16.2 inches Liquid Retina XDR', 'Processor': 'M3 Max 16-Core', 'RAM': '36 GB Unified', 'Storage': '1 TB SSD', 'Battery Life': 'Up to 22 hours', 'Color': 'Silver' },
  },
  {
    id: 'AD-XM5', sku: 'AD-XM5-SNY', name: 'Sony WH-1000XM5 Wireless Headphones', category: 'audio', glyph: 'motor',
    price: 398.00, unit: 'ea', moq: 1, stock: 85, lead: 'Ships today', tags: ['Sony', 'ANC', 'Bluetooth'],
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80'],
    description: 'Industry-leading noise cancellation.',
    tiers: [{ qty: 1, price: 398.00 }, { qty: 10, price: 368.00 }, { qty: 50, price: 348.00 }],
    specs: { 'Type': 'Over-Ear', 'Driver Unit': '30 mm', 'Noise Cancelling': 'Industry Leading ANC', 'Battery Life': 'Up to 30 hours', 'Bluetooth Version': '5.2', 'Weight': '250 g' },
  },
  {
    id: 'SW-APW9', sku: 'SW-APW9-45', name: 'Apple Watch Series 9 GPS — 45mm Midnight', category: 'smartwatch', glyph: 'transmission',
    price: 429.00, unit: 'ea', moq: 1, stock: 30, lead: 'Ships today', tags: ['Apple', 'GPS', 'Siri'],
    images: ['https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&q=80'],
    description: 'Advanced health, safety, and activity features.',
    tiers: [{ qty: 1, price: 429.00 }, { qty: 5, price: 409.00 }, { qty: 10, price: 389.00 }],
    specs: { 'Size': '45 mm', 'Display': 'Always-On Retina OLED', 'Water Resistance': 'Swimproof (50m)', 'Sensors': 'ECG, Blood Oxygen, Temp', 'Battery Life': 'Up to 18 hours' },
  },
  {
    id: 'AC-GAN100', sku: 'AC-GAN100-ANK', name: 'Anker Prime 100W GaN Wall Charger', category: 'accessories', glyph: 'fastener',
    price: 89.00, unit: 'ea', moq: 1, stock: 450, lead: 'Ships today', tags: ['Anker', 'GaN', 'USB-C'],
    images: ['https://images.unsplash.com/photo-1622445262465-2481c4574875?w=600&q=80'],
    description: 'Ultra-compact multi-port charger.',
    tiers: [{ qty: 1, price: 89.00 }, { qty: 20, price: 79.00 }, { qty: 100, price: 69.00 }],
    specs: { 'Total Wattage': '100 W', 'Ports': '2× USB-C, 1× USB-A', 'Technology': 'GaNPrime', 'Dimensions': '67.8 × 43.5 × 29 mm', 'Weight': '183 g' },
  },
  {
    id: 'SP-S24U', sku: 'SP-S24U-GRY', name: 'Samsung Galaxy S24 Ultra — 512GB Gray', category: 'smartphones', glyph: 'electrical',
    price: 1299.00, unit: 'ea', moq: 1, stock: 22, lead: 'Ships today', tags: ['Samsung', '5G', 'Stylus'],
    images: ['https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&q=80'],
    description: 'Welcome to the era of mobile AI.',
    tiers: [{ qty: 1, price: 1299.00 }, { qty: 5, price: 1249.00 }, { qty: 10, price: 1199.00 }],
    specs: { 'Screen Size': '6.8 inches QHD+', 'Processor': 'Snapdragon 8 Gen 3', 'Storage': '512 GB', 'Camera': '200 MP Main', 'Stylus': 'S Pen Included' },
  },
]

/* Infer a field type + unit from a sample spec value, so seeded
   categories arrive with a realistic dynamic-field schema. */
function inferField(label, value) {
  const v = String(value).trim()
  if (/^(yes|no|true|false)$/i.test(v)) return { label, type: 'boolean' }
  const dim = v.match(/^[\d.,]+\s*([A-Za-z°%/²"]+.*)$/)
  if (dim) return { label, type: 'dimension', unit: dim[1] }
  if (/^[\d.,]+$/.test(v)) return { label, type: 'number' }
  return { label, type: 'text' }
}

function buildFields(catId) {
  const seen = new Map()
  for (const p of products.filter((p) => p.category === catId)) {
    for (const [label, value] of Object.entries(p.specs)) {
      if (!seen.has(label)) seen.set(label, inferField(label, value))
    }
  }
  return [...seen.values()]
}

export async function seedDatabase({ force = false } = {}) {
  if (!force) {
    const existing = await Product.estimatedDocumentCount()
    if (existing > 0) return { skipped: true, products: existing }
  }

  await Promise.all([Category.deleteMany({}), Product.deleteMany({})])

  const catDocs = categories.map((c, i) => ({
    name: c.name,
    code: c.code,
    slug: c.id,
    blurb: c.blurb,
    parent: null,
    order: i,
    count: products.filter((p) => p.category === c.id).length,
    fields: buildFields(c.id),
  }))
  await Category.insertMany(catDocs)

  const prodDocs = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    glyph: p.glyph,
    price: p.price,
    unit: p.unit,
    moq: p.moq,
    stock: p.stock,
    lead: p.lead,
    tags: p.tags,
    tiers: p.tiers,
    status: 'live', // low stock is shown via the stock badge, not status
    specs: p.specs,
    images: p.images || [],
    description: p.description || '',
  }))
  await Product.insertMany(prodDocs)

  return { skipped: false, categories: catDocs.length, products: prodDocs.length }
}

/* Standalone runner: `npm run seed` */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { connectDB } = await import('./db.js')
  await connectDB()
  const res = await seedDatabase({ force: true })
  console.log('Seed complete:', res)
  process.exit(0)
}

/**
 * Connect to the data layer.
 * - If MONGODB_URI is set, connect to real MongoDB / Atlas.
 * - Otherwise, use the JSON-file local store (no MongoDB needed).
 *
 * The local store is the default for development — zero setup required.
 * Set MONGODB_URI when you're ready for a real database.
 */

let useLocalStore = false

export async function connectDB() {
  const uri = process.env.MONGODB_URI

  if (uri) {
    // ---- Real MongoDB ----
    const mongoose = (await import('mongoose')).default
    mongoose.set('strictQuery', true)
    await mongoose.connect(uri)
    console.log(`• Mongoose connected → ${uri.replace(/\/\/.*@/, '//***@')}`)
    return { uri, embedded: null }
  }

  // ---- Local JSON store (default dev mode) ----
  useLocalStore = true
  console.log('• No MONGODB_URI set — using local JSON file store')
  console.log('  Data is persisted in ./data/*.json')
  console.warn('  ⚠ For production, set MONGODB_URI to a managed MongoDB.')
  return { uri: null, embedded: null }
}

export function isLocalStore() {
  return useLocalStore
}

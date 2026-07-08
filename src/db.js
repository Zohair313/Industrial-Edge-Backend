import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

/**
 * Connect to MongoDB.
 * - If MONGODB_URI is set, connect to that (real Mongo / Atlas) — the
 *   recommended production path.
 * - Otherwise spin up an embedded MongoDB via mongodb-memory-server, but point
 *   it at a persistent on-disk dbPath so data SURVIVES server restarts. (The
 *   default memory-server is ephemeral; pinning dbPath makes it durable.)
 * The Mongoose layer is identical either way.
 */
let embedded = null

export async function connectDB() {
  let uri = process.env.MONGODB_URI

  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    const dbPath = path.resolve(process.cwd(), process.env.MONGO_DB_PATH || './.mongo-data')
    fs.mkdirSync(dbPath, { recursive: true })
    // A hard kill can leave a stale lock that blocks the next boot; WiredTiger
    // recovers from its journal, so clearing the lock is safe.
    try { fs.rmSync(path.join(dbPath, 'mongod.lock'), { force: true }) } catch {}
    console.log('• No MONGODB_URI set — starting embedded MongoDB (disk-backed)…')
    embedded = await MongoMemoryServer.create({
      instance: { dbName: 'industrial_edge', dbPath, storageEngine: 'wiredTiger' },
    })
    uri = embedded.getUri('industrial_edge')
    console.log(`• Embedded MongoDB ready · data persisted at ${dbPath}`)
    console.warn('  ⚠ For production use a managed MongoDB via MONGODB_URI.')
  }

  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  console.log(`• Mongoose connected → ${uri.replace(/\/\/.*@/, '//***@')}`)

  return { uri, embedded }
}

// Clean shutdown so the on-disk data files are flushed and not corrupted.
async function shutdown() {
  try { await mongoose.disconnect() } catch {}
  try { if (embedded) await embedded.stop({ doCleanup: false, force: false }) } catch {}
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

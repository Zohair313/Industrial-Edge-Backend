/* ============================================================
   LOCAL STORE — JSON-file-backed storage that mimics Mongoose
   ============================================================
   Drop-in replacement for Mongoose models when running without
   MongoDB. Persists data in ./data/<collection>.json on disk.
   Supports the subset of the Mongoose API used by this project.
   ============================================================ */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DATA_DIR = path.resolve(process.cwd(), process.env.LOCAL_DATA_PATH || './data')

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`)
}

function readData(name) {
  ensureDir()
  const fp = filePath(name)
  if (!fs.existsSync(fp)) return []
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch {
    return []
  }
}

function writeData(name, docs) {
  ensureDir()
  fs.writeFileSync(filePath(name), JSON.stringify(docs, null, 2), 'utf8')
}

function generateId() {
  return crypto.randomBytes(12).toString('hex')
}

/* Match a single filter condition against a document value */
function matchValue(docVal, condition) {
  if (condition === null || condition === undefined) return docVal === condition
  if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
    // MongoDB-style operators
    for (const [op, val] of Object.entries(condition)) {
      switch (op) {
        case '$regex': {
          const flags = condition.$options || ''
          return new RegExp(val, flags).test(String(docVal || ''))
        }
        case '$options': continue // handled by $regex
        case '$ne': if (docVal === val) return false; break
        case '$gt': if (!(docVal > val)) return false; break
        case '$gte': if (!(docVal >= val)) return false; break
        case '$lt': if (!(docVal < val)) return false; break
        case '$lte': if (!(docVal <= val)) return false; break
        case '$in': if (!Array.isArray(val) || !val.includes(docVal)) return false; break
        case '$nin': if (Array.isArray(val) && val.includes(docVal)) return false; break
        case '$exists': if (val && docVal === undefined) return false; if (!val && docVal !== undefined) return false; break
        default: break
      }
    }
    return true
  }
  return docVal === condition
}

/* Match a filter object against a document */
function matchFilter(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true
  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$or') {
      if (!Array.isArray(condition) || !condition.some(sub => matchFilter(doc, sub))) return false
      continue
    }
    if (key === '$and') {
      if (!Array.isArray(condition) || !condition.every(sub => matchFilter(doc, sub))) return false
      continue
    }
    // Nested key support: 'customer.email'
    const val = key.includes('.') ? key.split('.').reduce((o, k) => o?.[k], doc) : doc[key]
    if (!matchValue(val, condition)) return false
  }
  return true
}

/* Apply $set update operator */
function applyUpdate(doc, update) {
  const patched = { ...doc }
  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) {
      patched[k] = v
    }
  }
  if (update.$push) {
    for (const [k, v] of Object.entries(update.$push)) {
      if (!Array.isArray(patched[k])) patched[k] = []
      patched[k] = [...patched[k], { _id: generateId(), ...v }]
    }
  }
  if (update.$pull) {
    for (const [k, v] of Object.entries(update.$pull)) {
      if (Array.isArray(patched[k])) {
        patched[k] = patched[k].filter(item => !matchFilter(item, v))
      }
    }
  }
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      patched[k] = (patched[k] || 0) + v
    }
  }
  patched.updatedAt = new Date().toISOString()
  return patched
}

/* Sort comparator from Mongoose-style sort object */
function buildSortFn(sortObj) {
  if (!sortObj) return null
  const entries = Object.entries(sortObj)
  return (a, b) => {
    for (const [key, dir] of entries) {
      const va = a[key], vb = b[key]
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
    }
    return 0
  }
}

/* ---- LocalDocument: wraps a plain object with Mongoose-like methods ---- */
class LocalDocument {
  constructor(data, collection, opts = {}) {
    Object.assign(this, data)
    this.__collection = collection
    this.__opts = opts
    // Make internal props non-enumerable so they don't serialize
    Object.defineProperty(this, '__collection', { enumerable: false, writable: true })
    Object.defineProperty(this, '__opts', { enumerable: false, writable: true })
  }

  toJSON() {
    const obj = { ...this }
    delete obj.__collection
    delete obj.__opts
    // Add virtual id
    if (obj._id && !obj.id) obj.id = obj._id
    // Apply collection-specific transforms (e.g. strip passwordHash for admins)
    if (this.__opts?.toJSON?.transform) {
      return this.__opts.toJSON.transform(this, obj)
    }
    return obj
  }

  async save() {
    this.updatedAt = new Date().toISOString()
    const docs = readData(this.__collection)
    const idx = docs.findIndex(d => d._id === this._id)
    
    // Create a plain object for storage (without internal properties)
    const plain = { ...this }
    delete plain.__collection
    delete plain.__opts
    
    if (idx >= 0) {
      docs[idx] = plain
    } else {
      docs.push(plain)
    }
    writeData(this.__collection, docs)
    return this
  }

  async verifyPassword(plain) {
    const bcrypt = await import('bcryptjs')
    return bcrypt.default.compare(plain, this.passwordHash)
  }
}

/* ---- Query: chainable query builder ---- */
class Query {
  constructor(collection, filter, collectionOpts = {}) {
    this._collection = collection
    this._filter = filter || {}
    this._sort = null
    this._limit = 0
    this._lean = false
    this._leanOpts = {}
    this._collectionOpts = collectionOpts
  }

  sort(s) { this._sort = s; return this }
  limit(n) { this._limit = n; return this }
  lean(opts) { this._lean = true; this._leanOpts = opts || {}; return this }

  async then(resolve, reject) {
    try {
      let docs = readData(this._collection)
      docs = docs.filter(d => matchFilter(d, this._filter))
      if (this._sort) {
        const fn = buildSortFn(this._sort)
        if (fn) docs.sort(fn)
      }
      if (this._limit > 0) docs = docs.slice(0, this._limit)
      if (this._lean) {
        // Add virtual id for products
        docs = docs.map(d => {
          const obj = { ...d }
          if (this._leanOpts.virtuals && obj.sku && !obj.id) obj.id = obj.sku
          return obj
        })
        resolve(docs)
      } else {
        resolve(docs.map(d => new LocalDocument(d, this._collection, this._collectionOpts)))
      }
    } catch (e) { reject(e) }
  }
}

/* ---- SingleQuery: chainable findOne ---- */
class SingleQuery {
  constructor(collection, filter, collectionOpts = {}) {
    this._collection = collection
    this._filter = filter || {}
    this._lean = false
    this._leanOpts = {}
    this._collectionOpts = collectionOpts
  }

  lean(opts) { this._lean = true; this._leanOpts = opts || {}; return this }
  sort() { return this } // no-op for findOne

  async then(resolve, reject) {
    try {
      const docs = readData(this._collection)
      const doc = docs.find(d => matchFilter(d, this._filter))
      if (!doc) { resolve(null); return }
      if (this._lean) {
        const obj = { ...doc }
        if (this._leanOpts.virtuals && obj.sku && !obj.id) obj.id = obj.sku
        resolve(obj)
      } else {
        resolve(new LocalDocument(doc, this._collection, this._collectionOpts))
      }
    } catch (e) { reject(e) }
  }
}

/* ---- LocalCollection: the main model replacement ---- */
export class LocalCollection {
  constructor(name, opts = {}) {
    this.name = name
    this.opts = opts // { toJSON, virtuals, statics, methods }
  }

  /* ---- Mongoose-compatible static methods ---- */

  find(filter) {
    return new Query(this.name, filter, this.opts)
  }

  findOne(filter) {
    return new SingleQuery(this.name, filter, this.opts)
  }

  async findById(id) {
    const q = this.findOne({ _id: id })
    return q
  }

  async create(data) {
    const docs = readData(this.name)
    const now = new Date().toISOString()
    const doc = {
      _id: generateId(),
      ...data,
      // Convert Map to plain object if needed (specs field)
      ...(data.specs instanceof Map ? { specs: Object.fromEntries(data.specs) } : {}),
      createdAt: now,
      updatedAt: now,
    }
    // Check unique constraints
    if (this.opts.uniqueFields) {
      for (const field of this.opts.uniqueFields) {
        if (doc[field] && docs.some(d => d[field] === doc[field])) {
          const err = new Error(`Duplicate key: ${field}`)
          err.code = 11000
          throw err
        }
      }
    }
    docs.push(doc)
    writeData(this.name, docs)
    return new LocalDocument(doc, this.name, this.opts)
  }

  async insertMany(items) {
    const docs = readData(this.name)
    const now = new Date().toISOString()
    const newDocs = items.map(data => ({
      _id: generateId(),
      ...data,
      ...(data.specs instanceof Map ? { specs: Object.fromEntries(data.specs) } : {}),
      createdAt: now,
      updatedAt: now,
    }))
    docs.push(...newDocs)
    writeData(this.name, docs)
    return newDocs.map(d => new LocalDocument(d, this.name, this.opts))
  }

  async updateOne(filter, update, opts = {}) {
    const docs = readData(this.name)
    const idx = docs.findIndex(d => matchFilter(d, filter))
    if (idx >= 0) {
      docs[idx] = applyUpdate(docs[idx], update)
      writeData(this.name, docs)
      return { modifiedCount: 1, matchedCount: 1 }
    }
    if (opts.upsert) {
      const now = new Date().toISOString()
      const newDoc = { _id: generateId(), ...filter, createdAt: now, updatedAt: now }
      const patched = applyUpdate(newDoc, update)
      docs.push(patched)
      writeData(this.name, docs)
      return { modifiedCount: 0, matchedCount: 0, upsertedCount: 1 }
    }
    return { modifiedCount: 0, matchedCount: 0 }
  }

  async updateMany(filter, update) {
    const docs = readData(this.name)
    let count = 0
    for (let i = 0; i < docs.length; i++) {
      if (matchFilter(docs[i], filter)) {
        docs[i] = applyUpdate(docs[i], update)
        count++
      }
    }
    if (count > 0) writeData(this.name, docs)
    return { modifiedCount: count, matchedCount: count }
  }

  async findOneAndUpdate(filter, update, opts = {}) {
    const docs = readData(this.name)
    const idx = docs.findIndex(d => matchFilter(d, filter))
    if (idx < 0) return null
    docs[idx] = applyUpdate(docs[idx], update)
    writeData(this.name, docs)
    return new LocalDocument(docs[idx], this.name, this.opts)
  }

  async deleteOne(filter) {
    const docs = readData(this.name)
    const idx = docs.findIndex(d => matchFilter(d, filter))
    if (idx >= 0) {
      docs.splice(idx, 1)
      writeData(this.name, docs)
      return { deletedCount: 1 }
    }
    return { deletedCount: 0 }
  }

  async deleteMany(filter) {
    const docs = readData(this.name)
    const remaining = filter && Object.keys(filter).length > 0
      ? docs.filter(d => !matchFilter(d, filter))
      : []
    const count = docs.length - remaining.length
    writeData(this.name, remaining)
    return { deletedCount: count }
  }

  async countDocuments(filter) {
    const docs = readData(this.name)
    if (!filter || Object.keys(filter).length === 0) return docs.length
    return docs.filter(d => matchFilter(d, filter)).length
  }

  async estimatedDocumentCount() {
    return readData(this.name).length
  }

  async distinct(field) {
    const docs = readData(this.name)
    const vals = new Set()
    for (const d of docs) {
      const v = field.includes('.') ? field.split('.').reduce((o, k) => o?.[k], d) : d[field]
      if (v != null) vals.add(v)
    }
    return [...vals]
  }

  /* ---- Aggregate (basic support for the pipelines used in this project) ---- */
  async aggregate(pipeline) {
    let docs = readData(this.name)
    let results = [...docs]

    for (const stage of pipeline) {
      if (stage.$match) {
        results = results.filter(d => matchFilter(d, stage.$match))
      }
      else if (stage.$group) {
        const groups = new Map()
        for (const doc of results) {
          let key
          const idSpec = stage.$group._id
          if (idSpec === null) {
            key = '__all__'
          } else if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
            key = idSpec.slice(1).split('.').reduce((o, k) => o?.[k], doc) ?? 'null'
          } else if (typeof idSpec === 'object' && idSpec !== null) {
            // Handle $ifNull etc
            if (idSpec.$ifNull) {
              const [field, fallback] = idSpec.$ifNull
              const val = typeof field === 'string' && field.startsWith('$')
                ? field.slice(1).split('.').reduce((o, k) => o?.[k], doc)
                : field
              key = val ?? fallback
            } else {
              key = JSON.stringify(idSpec)
            }
          } else {
            key = String(idSpec)
          }

          if (!groups.has(key)) {
            groups.set(key, { _id: key === '__all__' ? null : key, __docs: [] })
          }
          groups.get(key).__docs.push(doc)
        }

        results = []
        for (const [, group] of groups) {
          const out = { _id: group._id }
          for (const [field, spec] of Object.entries(stage.$group)) {
            if (field === '_id') continue
            if (spec.$sum) {
              if (spec.$sum === 1) {
                out[field] = group.__docs.length
              } else if (typeof spec.$sum === 'string' && spec.$sum.startsWith('$')) {
                const f = spec.$sum.slice(1)
                out[field] = group.__docs.reduce((s, d) => s + (Number(d[f]) || 0), 0)
              } else if (typeof spec.$sum === 'object' && spec.$sum.$multiply) {
                const [a, b] = spec.$sum.$multiply
                out[field] = group.__docs.reduce((s, d) => {
                  const va = typeof a === 'string' && a.startsWith('$') ? Number(a.slice(1).split('.').reduce((o, k) => o?.[k], d)) || 0 : a
                  const vb = typeof b === 'string' && b.startsWith('$') ? Number(b.slice(1).split('.').reduce((o, k) => o?.[k], d)) || 0 : b
                  return s + va * vb
                }, 0)
              }
            }
            if (spec.$max) {
              const f = typeof spec.$max === 'string' && spec.$max.startsWith('$') ? spec.$max.slice(1) : spec.$max
              out[field] = group.__docs.reduce((m, d) => {
                const v = d[f]
                return v && (!m || new Date(v) > new Date(m)) ? v : m
              }, null)
            }
            if (spec.$last) {
              const f = typeof spec.$last === 'string' && spec.$last.startsWith('$') ? spec.$last.slice(1) : spec.$last
              const last = group.__docs[group.__docs.length - 1]
              out[field] = f.includes('.') ? f.split('.').reduce((o, k) => o?.[k], last) : last?.[f]
            }
          }
          results.push(out)
        }
      }
      else if (stage.$sort) {
        const fn = buildSortFn(stage.$sort)
        if (fn) results.sort(fn)
      }
      else if (stage.$limit) {
        results = results.slice(0, stage.$limit)
      }
      else if (stage.$unwind) {
        const field = typeof stage.$unwind === 'string'
          ? stage.$unwind
          : stage.$unwind.path
        const preserveNull = stage.$unwind.preserveNullAndEmptyArrays || false
        const fieldName = field.startsWith('$') ? field.slice(1) : field
        const unwound = []
        for (const doc of results) {
          const arr = doc[fieldName]
          if (Array.isArray(arr) && arr.length > 0) {
            for (const item of arr) {
              unwound.push({ ...doc, [fieldName]: item })
            }
          } else if (preserveNull) {
            unwound.push({ ...doc, [fieldName]: null })
          }
        }
        results = unwound
      }
      else if (stage.$lookup) {
        const { from, localField, foreignField, as } = stage.$lookup
        const foreignDocs = readData(from)
        for (let i = 0; i < results.length; i++) {
          const localVal = localField.split('.').reduce((o, k) => o?.[k], results[i])
          results[i][as] = foreignDocs.filter(fd => {
            const fv = foreignField.split('.').reduce((o, k) => o?.[k], fd)
            return fv === localVal
          })
        }
      }
    }

    return results
  }

  /* Static methods mirrored from Admin model */
  static async hashPassword(plain) {
    const bcrypt = await import('bcryptjs')
    return bcrypt.default.hash(plain, 12)
  }
}

/* Factory: create a collection with options */
export function createCollection(name, opts = {}) {
  const col = new LocalCollection(name, opts)
  // Copy static methods from opts
  if (opts.statics) {
    for (const [k, v] of Object.entries(opts.statics)) {
      col[k] = v
    }
  }
  return col
}

console.log(`• Using local JSON store (data at ${DATA_DIR})`)

import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGO_URI
  const dbName = process.env.MONGO_DB || undefined
  if (!uri) {
    throw new Error('MONGO_URI is required. Set it to your cloud MongoDB connection string.')
  }
  // Guard against placeholder URIs (e.g., with <cluster>/<db>)
  if (/[<>]/.test(uri) || /@<cluster>/.test(uri) || /\/\<db\>/.test(uri)) {
    throw new Error('MONGO_URI contains placeholders. Replace <cluster> and <db> with your actual Atlas values.')
  }
  try {
    await mongoose.connect(uri, {
      ...(dbName ? { dbName } : {}),
      serverSelectionTimeoutMS: 20000,
    })
  } catch (err) {
    console.error('[db] Connection failed', err?.message || err)
    throw err
  }
  console.log('[db] Connected to cloud MongoDB via MONGO_URI')
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
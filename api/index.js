let appPromise

function loadApp() {
  if (!appPromise) {
    appPromise = import('../app.js').then(mod => mod.default)
  }
  return appPromise
}

export default async (req, res) => {
  if ((process.env.VERCEL || process.env.NODE_ENV === 'production') && !process.env.MONGO_URI) {
    res.status(500).json({ message: 'Persistent DB not configured: set MONGO_URI' })
    return
  }
  const app = await loadApp()
  return app(req, res)
}
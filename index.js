import http from 'http'
import app from './app.js'
import { initSocket } from './socket.js'

const PORT = process.env.PORT || 4002

const httpServer = http.createServer(app)
const io = initSocket(httpServer)
app.use((req, _res, next) => { req.io = io; next() })

httpServer.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
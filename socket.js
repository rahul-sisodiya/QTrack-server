import { Server } from 'socket.io'

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  })

  io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
      if (roomId) socket.join(roomId)
    })

    // Track role per socket for enforcement
    socket.on('identify', ({ role }) => {
      socket.data = socket.data || {}
      socket.data.role = role
    })

    // WebRTC signaling relay with doctor-only offer initiation
    socket.on('webrtc:offer', ({ roomId, sdp }) => {
      if (!roomId || !sdp) return
      if (socket.data?.role !== 'doctor') return
      socket.to(roomId).emit('webrtc:offer', { roomId, sdp })
    })
    socket.on('webrtc:answer', ({ roomId, sdp }) => {
      if (!roomId || !sdp) return
      socket.to(roomId).emit('webrtc:answer', { roomId, sdp })
    })
    socket.on('webrtc:ice-candidate', ({ roomId, candidate }) => {
      if (!roomId || !candidate) return
      socket.to(roomId).emit('webrtc:ice-candidate', { roomId, candidate })
    })
    socket.on('webrtc:end', ({ roomId }) => {
      if (!roomId) return
      socket.to(roomId).emit('webrtc:end', { roomId })
    })

    socket.on('disconnect', () => {})
  })

  return io
}
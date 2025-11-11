import { Router } from 'express'
import ChatRoom from '../models/ChatRoom.js'
import Message from '../models/Message.js'
import Doctor from '../models/Doctor.js'
import Patient from '../models/Patient.js'

const router = Router()

// Create or get chat room for doctor/patient pair
router.post('/room', async (req, res) => {
  try {
    const { doctorId, patientId } = req.body
    if (!doctorId || !patientId) {
      return res.status(400).json({ error: 'doctorId and patientId are required' })
    }
    const doctor = await Doctor.findById(doctorId)
    const patient = await Patient.findById(patientId)
    if (!doctor || !patient) return res.status(404).json({ error: 'Doctor or Patient not found' })
    let room = await ChatRoom.findOne({ doctorId, patientId })
    if (!room) room = await ChatRoom.create({ doctorId, patientId })
    res.json(room)
  } catch (err) {
    console.error('Create/get room error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// List rooms for a doctor
router.get('/rooms/doctor/:doctorId', async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ doctorId: req.params.doctorId }).populate('patientId')
    res.json(rooms)
  } catch (err) {
    console.error('List rooms error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// List rooms for a patient
router.get('/rooms/patient/:patientId', async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ patientId: req.params.patientId }).populate('doctorId')
    res.json(rooms)
  } catch (err) {
    console.error('List rooms error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Fetch messages for a room
router.get('/messages/:roomId', async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId }).sort({ createdAt: 1 })
    res.json(messages)
  } catch (err) {
    console.error('Get messages error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Post a message
router.post('/messages', async (req, res) => {
  try {
    const { roomId, senderRole, text } = req.body
    if (!roomId || !senderRole || !text) return res.status(400).json({ error: 'roomId, senderRole, text required' })
    const msg = await Message.create({ roomId, senderRole, text })
    if (req.io) req.io.to(roomId).emit('message', msg)
    res.status(201).json(msg)
  } catch (err) {
    console.error('Post message error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
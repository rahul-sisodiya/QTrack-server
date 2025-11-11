import { Router } from 'express'
import Queue from '../models/Queue.js'
import Doctor from '../models/Doctor.js'
import Patient from '../models/Patient.js'

const router = Router()

// Join queue for a doctor
router.post('/join', async (req, res) => {
  try {
    const { doctorId, patientId: rawPatientId } = req.body || {}
    if (!doctorId) return res.status(400).json({ message: 'doctorId is required' })
    const doctor = await Doctor.findById(doctorId)
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' })

    let patientId = rawPatientId
    if (!patientId) {
      const firstPatient = await Patient.findOne({})
      if (!firstPatient) return res.status(400).json({ message: 'No patient available' })
      patientId = firstPatient._id
    }

    const lastWaiting = await Queue.find({ doctorId, status: 'waiting' }).sort({ position: -1 }).limit(1)
    const nextPos = lastWaiting.length ? (lastWaiting[0].position + 1) : 1
    const created = await Queue.create({ doctorId, patientId, status: 'waiting', position: nextPos })

    req.io?.to(String(doctorId)).emit('queue:update', { doctorId, queueLength: nextPos })
    res.status(201).json({ id: String(created._id), position: nextPos })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Get current status for a queue item
router.get('/status/:id', async (req, res) => {
  try {
    const q = await Queue.findById(req.params.id)
    if (!q) return res.status(404).json({ message: 'Not found' })
    const ahead = await Queue.countDocuments({ doctorId: q.doctorId, status: 'waiting', position: { $lt: q.position } })
    res.json({ position: ahead + 1, status: q.status })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Leave queue
router.patch('/leave/:id', async (req, res) => {
  try {
    const q = await Queue.findById(req.params.id)
    if (!q) return res.status(404).json({ message: 'Not found' })
    if (q.status !== 'waiting') return res.json({ status: q.status })
    q.status = 'left'
    await q.save()
    req.io?.to(String(q.doctorId)).emit('queue:update', { doctorId: String(q.doctorId) })
    res.json({ status: 'left' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Doctor current queue
router.get('/doctor/:doctorId/current', async (req, res) => {
  try {
    const { doctorId } = req.params
    const items = await Queue.find({ doctorId, status: 'waiting' }).sort({ position: 1 }).populate({ path: 'patientId', populate: { path: 'userId' } })
    res.json({
      queueLength: items.length,
      items: items.map(i => ({
        id: String(i._id),
        position: i.position,
        patient: i.patientId?.userId?.name || 'Unknown',
        patientId: String(i.patientId?._id || '')
      }))
    })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// History for patient
router.get('/history/patient/:patientId', async (req, res) => {
  try {
    const items = await Queue.find({ patientId: req.params.patientId }).sort({ createdAt: -1 }).populate({ path: 'doctorId', populate: { path: 'userId' } })
    res.json(items.map(i => ({ id: String(i._id), doctor: i.doctorId?.userId?.name || 'Doctor', date: i.createdAt, status: i.status })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Mark queue item as served (done)
router.patch('/serve/:id', async (req, res) => {
  try {
    const q = await Queue.findById(req.params.id)
    if (!q) return res.status(404).json({ message: 'Not found' })
    if (q.status !== 'waiting') return res.json({ status: q.status })
    const oldPos = q.position
    q.status = 'served'
    await q.save()
    await Queue.updateMany({ doctorId: q.doctorId, status: 'waiting', position: { $gt: oldPos } }, { $inc: { position: -1 } })
    const remaining = await Queue.countDocuments({ doctorId: q.doctorId, status: 'waiting' })
    req.io?.to(String(q.doctorId)).emit('queue:update', { doctorId: String(q.doctorId), queueLength: remaining })
    res.json({ status: 'served' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Remove (cancel) queue item
router.patch('/cancel/:id', async (req, res) => {
  try {
    const q = await Queue.findById(req.params.id)
    if (!q) return res.status(404).json({ message: 'Not found' })
    if (q.status !== 'waiting') return res.json({ status: q.status })
    const oldPos = q.position
    q.status = 'cancelled'
    await q.save()
    await Queue.updateMany({ doctorId: q.doctorId, status: 'waiting', position: { $gt: oldPos } }, { $inc: { position: -1 } })
    const remaining = await Queue.countDocuments({ doctorId: q.doctorId, status: 'waiting' })
    req.io?.to(String(q.doctorId)).emit('queue:update', { doctorId: String(q.doctorId), queueLength: remaining })
    res.json({ status: 'cancelled' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Defer (wait) queue item to the end of the queue
router.patch('/defer/:id', async (req, res) => {
  try {
    const q = await Queue.findById(req.params.id)
    if (!q) return res.status(404).json({ message: 'Not found' })
    if (q.status !== 'waiting') return res.json({ status: q.status })
    const oldPos = q.position
    const lastWaiting = await Queue.find({ doctorId: q.doctorId, status: 'waiting' }).sort({ position: -1 }).limit(1)
    const lastPos = lastWaiting.length ? lastWaiting[0].position : 1
    if (oldPos >= lastPos) return res.json({ position: oldPos })
    await Queue.updateMany({ doctorId: q.doctorId, status: 'waiting', position: { $gt: oldPos } }, { $inc: { position: -1 } })
    q.position = lastPos
    await q.save()
    const remaining = await Queue.countDocuments({ doctorId: q.doctorId, status: 'waiting' })
    req.io?.to(String(q.doctorId)).emit('queue:update', { doctorId: String(q.doctorId), queueLength: remaining })
    res.json({ position: q.position })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
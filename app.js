import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { connectDB } from './db.js'
import User from './models/User.js'
import Doctor from './models/Doctor.js'
import Patient from './models/Patient.js'
import Appointment from './models/Appointment.js'

import chatRouter from './routes/chat.js'
import queueRouter from './routes/queue.js'
import recordsRouter from './routes/records.js'
import seedRouter from './routes/seed.js'
import aiRouter from './routes/ai.js'

dotenv.config()
const app = express()

const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
app.use(allowed.length ? cors({ origin: allowed }) : cors())
app.use(express.json())

await connectDB()

// Health
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    let { name, email, password, role } = req.body || {}
    if (!name || !email || !password || !role) return res.status(400).json({ message: 'Missing fields' })
    email = String(email).trim().toLowerCase()
    console.log('[auth/register] Attempt', { email, role })
    const exists = await User.findOne({ email })
    if (exists) {
      console.log('[auth/register] Exists', { email, id: String(exists._id) })
    }
    if (exists) return res.status(409).json({ message: 'Email already registered' })
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, passwordHash, role })
    console.log('[auth/register] Created', { id: String(user._id), email, role })
    if (role === 'doctor') {
      await Doctor.create({ userId: user._id, specialization: 'General', clinicAddress: '', phone: '' })
    } else if (role === 'patient') {
      await Patient.create({ userId: user._id, age: 0, phone: '' })
    }
    res.status(201).json({ message: 'registered' })
  } catch (err) {
    console.error('[auth/register] Error', err?.message || err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    let { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' })
    email = String(email).trim().toLowerCase()
    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    const token = jwt.sign(
      { sub: String(user._id), role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role }
    })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Patient
app.get('/api/patient/doctors', async (_req, res) => {
  try {
    const doctors = await Doctor.find({}).populate('userId')
    res.json(doctors.map(d => ({ id: String(d._id), name: d.userId?.name || 'Doctor', specialization: d.specialization || 'General' })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})
app.get('/api/patient/me', async (req, res) => {
  try {
    // Prefer JWT auth; fallback to query userId
    let patient
    const auth = req.headers?.authorization || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) {
      try {
        const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret')
        if (payload?.sub && payload?.role === 'patient') {
          patient = await Patient.findOne({ userId: payload.sub })
        }
      } catch {}
    }
    if (!patient) {
      const { userId } = req.query || {}
      if (!userId) return res.status(400).json({ message: 'userId or token required' })
      patient = await Patient.findOne({ userId })
    }
    if (!patient) return res.status(404).json({ message: 'Patient not found' })
    res.json({ patientId: String(patient._id) })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})
app.post('/api/patient/appointments', async (req, res) => {
  try {
    const { doctorId, date, time, notes } = req.body || {}
    const patient = await Patient.findOne({}) // demo: first patient
    if (!doctorId || !date || !time || !patient) return res.status(400).json({ message: 'Missing fields' })
    const created = await Appointment.create({ doctorId, patientId: patient._id, date, time, notes })
    req.io?.to(String(doctorId)).emit('doctor:dashboard:update', { doctorId: String(doctorId), appointmentId: String(created._id), action: 'create' })
    res.status(201).json({ id: String(created._id) })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin
app.get('/api/admin/summary', async (_req, res) => {
  const doctors = await Doctor.countDocuments({})
  const patients = await Patient.countDocuments({})
  const today = new Date().toISOString().slice(0, 10)
  const appointments_today = await Appointment.countDocuments({ date: today })
  res.json({ doctors, patients, appointments_today })
})

// Doctor profile endpoint (demo)
app.get('/api/doctor/me', async (req, res) => {
  try {
    const { userId } = req.query || {}
    if (!userId) return res.status(400).json({ message: 'userId is required' })
    let d = await Doctor.findOne({ userId })
    if (!d) {
      // Auto-create doctor profile if missing
      d = await Doctor.create({ userId, specialization: 'General', clinicAddress: '', phone: '' })
    }
    res.json({ doctorId: String(d._id) })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Doctor: patients list
app.get('/api/doctor/patients', async (_req, res) => {
  try {
    const patients = await Patient.find({}).populate('userId')
    res.json(patients.map(p => ({ id: String(p._id), name: p.userId?.name || 'Patient', age: p.age || 0, phone: p.phone || '' })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Doctor: appointments list (uses token if provided)
app.get('/api/doctor/appointments', async (req, res) => {
  try {
    let doctorFilter = {}
    const auth = req.headers?.authorization || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) {
      try {
        const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret')
        if (payload?.sub && payload?.role === 'doctor') {
          const d = await Doctor.findOne({ userId: payload.sub })
          if (d) doctorFilter = { doctorId: d._id }
        }
      } catch {}
    }
    const items = await Appointment.find(doctorFilter).sort({ date: 1, time: 1 }).populate({ path: 'patientId', populate: { path: 'userId' } })
    res.json(items.map(a => ({ id: String(a._id), date: a.date, time: a.time, patient: a.patientId?.userId?.name || 'Patient', status: a.status, patientId: String(a.patientId?._id || '') })))
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Doctor: appointment detail
app.get('/api/doctor/appointments/:id', async (req, res) => {
  try {
    const a = await Appointment.findById(req.params.id).populate({ path: 'patientId', populate: { path: 'userId' } })
    if (!a) return res.status(404).json({ message: 'Not found' })
    res.json({ id: String(a._id), date: a.date, time: a.time, status: a.status, patient: { name: a.patientId?.userId?.name || 'Patient', phone: a.patientId?.phone || '' } })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Doctor: reschedule
app.patch('/api/doctor/appointments/:id/reschedule', async (req, res) => {
  try {
    const { date, time } = req.body || {}
    if (!date || !time) return res.status(400).json({ message: 'Missing fields' })
    const a = await Appointment.findById(req.params.id)
    if (!a) return res.status(404).json({ message: 'Not found' })
    a.date = date
    a.time = time
    await a.save()
    req.io?.to(String(a.doctorId)).emit('doctor:dashboard:update', { doctorId: String(a.doctorId), appointmentId: String(a._id), action: 'reschedule' })
    res.json({ updated: true })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Doctor: cancel
app.patch('/api/doctor/appointments/:id/cancel', async (req, res) => {
  try {
    const a = await Appointment.findById(req.params.id)
    if (!a) return res.status(404).json({ message: 'Not found' })
    a.status = 'Cancelled'
    await a.save()
    req.io?.to(String(a.doctorId)).emit('doctor:dashboard:update', { doctorId: String(a.doctorId), appointmentId: String(a._id), action: 'cancel' })
    res.json({ status: 'Cancelled' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Doctor: save availability
app.post('/api/doctor/availability', async (req, res) => {
  try {
    const { slots } = req.body || {}
    let doctor
    const auth = req.headers?.authorization || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) {
      try {
        const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret')
        if (payload?.sub && payload?.role === 'doctor') {
          doctor = await Doctor.findOne({ userId: payload.sub })
        }
      } catch {}
    }
    if (!doctor) return res.status(400).json({ message: 'Doctor auth required' })
    const normalized = Array.isArray(slots) ? slots.filter(s => s && typeof s.day === 'string' && typeof s.slot === 'string').map(s => ({ day: s.day, slot: s.slot })) : []
    doctor.availability = normalized
    await doctor.save()
    res.json({ saved: true, availability: doctor.availability })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Doctor: dashboard
app.get('/api/doctor/dashboard/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params
    const today = new Date().toISOString().slice(0, 10)
    const upcomingItemsRaw = await Appointment.find({ doctorId, status: { $ne: 'Cancelled' } }).sort({ date: 1, time: 1 }).limit(5).populate({ path: 'patientId', populate: { path: 'userId' } })
    const upcomingItems = upcomingItemsRaw.map(a => ({ id: String(a._id), date: a.date, time: a.time, patient: a.patientId?.userId?.name || 'Patient', status: a.status, patientId: String(a.patientId?._id || '') }))
    const todayAppointments = await Appointment.countDocuments({ doctorId, date: today })
    const upcomingCount = await Appointment.countDocuments({ doctorId, date: { $gte: today }, status: { $ne: 'Cancelled' } })
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const newPatients = await Patient.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    const revenueThisWeek = 0
    res.json({ todayAppointments, upcomingCount, newPatients, revenueThisWeek, upcomingItems })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Routers
app.use('/api/chat', chatRouter)
app.use('/api/queue', queueRouter)
app.use('/api/records', recordsRouter)
app.use('/api/seed', seedRouter)
app.use('/api/ai', aiRouter)

app.get('/api/patient/preferences', async (req, res) => {
  try {
    // Identify patient from JWT or query userId
    let patient
    const auth = req.headers?.authorization || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) {
      try {
        const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret')
        if (payload?.sub && payload?.role === 'patient') {
          patient = await Patient.findOne({ userId: payload.sub })
          if (!patient) patient = await Patient.create({ userId: payload.sub })
        }
      } catch {}
    }
    if (!patient) {
      const { userId } = req.query || {}
      if (userId) patient = await Patient.findOne({ userId })
    }
    if (!patient) return res.status(401).json({ message: 'Patient auth required' })
    res.json({
      condition: patient.condition || '',
      vitals: patient.vitals || { heightCm: 0, weightKg: 0, bloodPressure: '', heartRate: 0 },
      preferences: {
        notifications: Boolean(patient.preferences?.notifications ?? true),
        darkMode: Boolean(patient.preferences?.darkMode ?? false),
        defaultDoctorId: patient.preferences?.defaultDoctorId ? String(patient.preferences.defaultDoctorId) : '',
      },
    })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/patient/preferences', async (req, res) => {
  try {
    // Identify patient from JWT or query userId
    let patient
    const auth = req.headers?.authorization || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) {
      try {
        const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret')
        if (payload?.sub && payload?.role === 'patient') {
          patient = await Patient.findOne({ userId: payload.sub })
          if (!patient) patient = await Patient.create({ userId: payload.sub })
        }
      } catch {}
    }
    if (!patient) {
      const { userId } = req.query || {}
      if (userId) patient = await Patient.findOne({ userId })
    }
    if (!patient) return res.status(401).json({ message: 'Patient auth required' })

    const { condition, vitals, preferences } = req.body || {}

    // Build atomic update
    const set = {}
    const unset = {}
    if (typeof condition === 'string') set.condition = condition
    if (vitals && typeof vitals === 'object') {
      set.vitals = {
        heightCm: Number(vitals.heightCm || patient.vitals?.heightCm || 0),
        weightKg: Number(vitals.weightKg || patient.vitals?.weightKg || 0),
        bloodPressure: String(vitals.bloodPressure || patient.vitals?.bloodPressure || ''),
        heartRate: Number(vitals.heartRate || patient.vitals?.heartRate || 0),
      }
    }
    if (preferences && typeof preferences === 'object') {
      set['preferences.notifications'] = Boolean(preferences.notifications ?? patient.preferences?.notifications ?? true)
      set['preferences.darkMode'] = Boolean(preferences.darkMode ?? patient.preferences?.darkMode ?? false)
      const incomingDefault = preferences.defaultDoctorId
      if (incomingDefault === '') set['preferences.defaultDoctorId'] = null
      else if (incomingDefault) set['preferences.defaultDoctorId'] = incomingDefault
    }

    // Apply update
    if (Object.keys(set).length || Object.keys(unset).length) {
      await Patient.updateOne({ _id: patient._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) })
    }
    res.json({ saved: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

export default app
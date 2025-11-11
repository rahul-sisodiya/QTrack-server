import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Doctor from '../models/Doctor.js'
import Patient from '../models/Patient.js'
import Appointment from '../models/Appointment.js'
import HealthRecord from '../models/HealthRecord.js'
import ChatRoom from '../models/ChatRoom.js'
import Message from '../models/Message.js'
import Queue from '../models/Queue.js'

const router = Router()

router.post('/', async (_req, res) => {
  try {
    // Create demo doctor user
    let docUser = await User.findOne({ email: 'doctor@example.com' })
    if (!docUser) {
      docUser = await User.create({ name: 'Dr. Alice', email: 'doctor@example.com', passwordHash: await bcrypt.hash('password', 10), role: 'doctor' })
    }
    let doctor = await Doctor.findOne({ userId: docUser._id })
    if (!doctor) {
      doctor = await Doctor.create({ userId: docUser._id, specialization: 'Cardiology', clinicAddress: '123 Health St', phone: '555-0001', availability: [{ day: 'Mon', slot: '10:00-12:00' }] })
    }

    // Create demo patient user
    let patUser = await User.findOne({ email: 'patient@example.com' })
    if (!patUser) {
      patUser = await User.create({ name: 'John Patient', email: 'patient@example.com', passwordHash: await bcrypt.hash('password', 10), role: 'patient' })
    }
    let patient = await Patient.findOne({ userId: patUser._id })
    if (!patient) {
      patient = await Patient.create({ userId: patUser._id, age: 32, phone: '555-1001' })
    }

    // Appointment
    const today = new Date().toISOString().slice(0, 10)
    const appt = await Appointment.findOne({ doctorId: doctor._id, patientId: patient._id, date: today })
    if (!appt) await Appointment.create({ doctorId: doctor._id, patientId: patient._id, date: today, time: '10:30', status: 'Scheduled', notes: 'Initial checkup' })

    // Health record
    const rec = await HealthRecord.findOne({ patientId: patient._id, date: today, type: 'Lab' })
    if (!rec) await HealthRecord.create({ patientId: patient._id, date: today, type: 'Lab', doctorName: 'Dr. Alice', fileUrl: '', notes: 'CBC normal' })

    // Chat room and message
    let room = await ChatRoom.findOne({ doctorId: doctor._id, patientId: patient._id })
    if (!room) room = await ChatRoom.create({ doctorId: doctor._id, patientId: patient._id })
    const msgExists = await Message.findOne({ roomId: room._id })
    if (!msgExists) await Message.create({ roomId: room._id, senderRole: 'doctor', text: 'Hello! How can I help you today?' })

    // Queue item
    const waitingCount = await Queue.countDocuments({ doctorId: doctor._id, status: 'waiting' })
    const qExists = await Queue.findOne({ doctorId: doctor._id, patientId: patient._id, status: 'waiting' })
    if (!qExists) await Queue.create({ doctorId: doctor._id, patientId: patient._id, status: 'waiting', position: waitingCount + 1 })

    res.json({
      doctor: { userId: String(docUser._id), doctorId: String(doctor._id) },
      patient: { userId: String(patUser._id), patientId: String(patient._id) },
      seeded: true,
    })
  } catch (err) {
    console.error('Seed error', err)
    res.status(500).json({ message: 'Seed failed' })
  }
})

export default router
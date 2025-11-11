import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { connectDB } from './db.js'
import User from './models/User.js'
import Doctor from './models/Doctor.js'
import Patient from './models/Patient.js'
import Appointment from './models/Appointment.js'

dotenv.config()

async function run() {
  await connectDB()

  await Promise.all([
    User.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
  ])

  const pass = await bcrypt.hash('password', 10)

  const doctorUser = await User.create({
    name: 'Dr. Jane Doe',
    email: 'doctor@example.com',
    passwordHash: pass,
    role: 'doctor',
  })
  const doctor = await Doctor.create({
    userId: doctorUser._id,
    specialization: 'Cardiology',
    clinicAddress: '123 Clinic St',
    phone: '555-0001',
  })

  const patientUser = await User.create({
    name: 'John Patient',
    email: 'patient@example.com',
    passwordHash: pass,
    role: 'patient',
  })
  const patient = await Patient.create({
    userId: patientUser._id,
    age: 34,
    phone: '555-0002',
  })

  await User.create({
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: pass,
    role: 'admin',
  })

  const today = new Date().toISOString().slice(0, 10)
  await Appointment.create({
    doctorId: doctor._id,
    patientId: patient._id,
    date: today,
    time: '10:00',
    notes: 'Initial seed appointment',
  })

  console.log('Seed complete:')
  console.log('Doctor: doctor@example.com / password')
  console.log('Patient: patient@example.com / password')
  console.log('Admin: admin@example.com / password')
  process.exit(0)
}

run().catch(err => {
  console.error('Seed error:', err)
  process.exit(1)
})
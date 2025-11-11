import mongoose from 'mongoose'

const PatientSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  age: Number,
  phone: String,
  // Persist patient health details previously stored in localStorage
  condition: { type: String, default: '' },
  vitals: {
    heightCm: { type: Number, default: 0 },
    weightKg: { type: Number, default: 0 },
    bloodPressure: { type: String, default: '' },
    heartRate: { type: Number, default: 0 },
  },
  // Persist patient app preferences
  preferences: {
    notifications: { type: Boolean, default: true },
    darkMode: { type: Boolean, default: false },
    defaultDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  },
}, { timestamps: true })

export default mongoose.model('Patient', PatientSchema)
import mongoose from 'mongoose'

const DoctorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  specialization: String,
  clinicAddress: String,
  phone: String,
  availability: [{ day: String, slot: String }],
}, { timestamps: true })

export default mongoose.model('Doctor', DoctorSchema)
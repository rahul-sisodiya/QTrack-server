import mongoose from 'mongoose'

const QueueSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  status: { type: String, enum: ['waiting', 'served', 'left', 'cancelled'], default: 'waiting' },
  position: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.model('Queue', QueueSchema)
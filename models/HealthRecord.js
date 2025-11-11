import mongoose from 'mongoose'

const HealthRecordSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  type: { type: String, required: true }, // e.g., Lab, X-Ray
  doctorName: { type: String },
  fileUrl: { type: String }, // For demo, store a URL or path
  notes: { type: String },
}, { timestamps: true })

export default mongoose.model('HealthRecord', HealthRecordSchema)
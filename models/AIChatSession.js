import mongoose from 'mongoose'

const AIChatSessionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  title: { type: String },
  lastUsedAt: { type: Date, default: Date.now },
}, { timestamps: true })

export default mongoose.model('AIChatSession', AIChatSessionSchema)
import mongoose from 'mongoose'

const AIMessageSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIChatSession', required: true },
  role: { type: String, enum: ['user', 'ai'], required: true },
  text: { type: String, required: true },
}, { timestamps: true })

export default mongoose.model('AIMessage', AIMessageSchema)
import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  senderRole: { type: String, enum: ['doctor', 'patient'], required: true },
  text: { type: String, required: true },
}, { timestamps: true })

export default mongoose.model('Message', MessageSchema)
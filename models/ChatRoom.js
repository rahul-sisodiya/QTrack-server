import mongoose from 'mongoose'

const ChatRoomSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
}, { timestamps: true })

export default mongoose.model('ChatRoom', ChatRoomSchema)
import { Router } from 'express'
import HealthRecord from '../models/HealthRecord.js'
import Patient from '../models/Patient.js'

const router = Router()

// List records for a patient
router.get('/patient/:patientId', async (req, res) => {
  try {
    const items = await HealthRecord.find({ patientId: req.params.patientId }).sort({ date: -1 })
    res.json(items.map(r => ({ id: String(r._id), date: r.date, type: r.type, doctorName: r.doctorName || '', fileUrl: r.fileUrl || '', notes: r.notes || '' })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Upload a new record (metadata only)
router.post('/upload', async (req, res) => {
  try {
    let { patientId, date, type, doctorName, fileUrl, notes } = req.body || {}
    if (!patientId) {
      const p = await Patient.findOne({})
      if (!p) return res.status(400).json({ message: 'No patient available' })
      patientId = p._id
    }
    if (!date || !type) return res.status(400).json({ message: 'Missing fields' })
    // Enforce PDF/JPEG URLs when fileUrl is provided
    if (fileUrl) {
      try {
        const u = new URL(fileUrl)
        if (!['http:', 'https:'].includes(u.protocol)) {
          return res.status(400).json({ message: 'fileUrl must be http/https URL' })
        }
        const lower = u.pathname.toLowerCase()
        const ok = lower.endsWith('.pdf') || lower.endsWith('.jpeg') || lower.endsWith('.jpg')
        if (!ok) return res.status(400).json({ message: 'fileUrl must be a PDF or JPEG' })
      } catch (e) {
        return res.status(400).json({ message: 'fileUrl must be a valid URL' })
      }
    }
    const created = await HealthRecord.create({ patientId, date, type, doctorName, fileUrl, notes })
    res.status(201).json({ id: String(created._id) })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Delete a record
router.delete('/:id', async (req, res) => {
  try {
    await HealthRecord.findByIdAndDelete(req.params.id)
    res.json({ deleted: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
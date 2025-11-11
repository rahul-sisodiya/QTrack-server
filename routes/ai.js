import { Router } from 'express'
import jwt from 'jsonwebtoken'
import AIChatSession from '../models/AIChatSession.js'
import AIMessage from '../models/AIMessage.js'
import Patient from '../models/Patient.js'

const router = Router()

function toGenParts(text) {
  return [{ text: String(text || '') }]
}

async function getPatientIdFromReq(req) {
  // Try JWT first
  const auth = req.headers?.authorization || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) {
    try {
      const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret')
      if (payload?.sub && payload?.role === 'patient') {
        const p = await Patient.findOne({ userId: payload.sub })
        if (p) return String(p._id)
      }
    } catch {}
  }
  // Fallback to explicit patientId in query/body
  const pid = req.query?.patientId || req.body?.patientId
  return pid ? String(pid) : ''
}

// System persona: Q — professional medical information assistant
const SYSTEM_PROMPT = [
  'You are Q, a professional medical information assistant for QTrack.',
  'Safety: You do not provide medical advice or diagnosis.',
  'Offer general health information, self-care guidance, and when to contact a professional.',
  'Tone: courteous, empathetic, clear, and concise — like a doctor explaining options.',
  'Style: use short paragraphs and numbered points when helpful.',
  'Do NOT use asterisks (*) or Markdown bullets; avoid heavy Markdown formatting.',
  'Keep outputs clean, professional, and easy to skim.',
].join(' ')

// Ask Q and persist conversation in an AIChatSession
router.post('/ask', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ message: 'GEMINI_API_KEY not set' })

    const { prompt, history, sessionId: existingSessionId } = req.body || {}
    const q = (prompt || '').trim()
    if (!q) return res.status(400).json({ message: 'prompt is required' })

    const patientId = await getPatientIdFromReq(req)
    if (!patientId) return res.status(401).json({ message: 'Patient auth required' })

    // Ensure a session exists
    let session
    if (existingSessionId) {
      session = await AIChatSession.findOne({ _id: existingSessionId, patientId })
    }
    if (!session) {
      const title = q.slice(0, 80)
      session = await AIChatSession.create({ patientId, title })
    }

    // Persist user's message
    await AIMessage.create({ sessionId: session._id, role: 'user', text: q })

    // Fetch recent messages for context
    const recent = await AIMessage.find({ sessionId: session._id }).sort({ createdAt: -1 }).limit(20)
    const contextual = [...recent].reverse()

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel(
      { model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' },
      { apiVersion: process.env.GEMINI_API_VERSION || 'v1' }
    )

    // Compose contents with persona + stored history
    const contents = []
    contents.push({ role: 'user', parts: toGenParts(SYSTEM_PROMPT) })
    // Append any client-provided history first (for backward compatibility)
    if (Array.isArray(history)) {
      for (const h of history) {
        const role = h?.role === 'user' ? 'user' : 'model'
        contents.push({ role, parts: toGenParts(h?.text || '') })
      }
    }
    // Append stored conversation
    for (const m of contextual) {
      const role = m.role === 'user' ? 'user' : 'model' // map 'ai' -> 'model'
      contents.push({ role, parts: toGenParts(m.text) })
    }
    // Append current question
    contents.push({ role: 'user', parts: toGenParts(q) })

    const result = await model.generateContent({ contents })
    const replyText = result?.response?.text?.() || 'No response.'

    // Persist AI's reply and update session
    await AIMessage.create({ sessionId: session._id, role: 'ai', text: replyText })
    session.lastUsedAt = new Date()
    // Optionally update title if it's empty
    if (!session.title) session.title = q.slice(0, 80)
    await session.save()

    res.json({ reply: replyText, sessionId: String(session._id), session: { id: String(session._id), title: session.title } })
  } catch (err) {
    console.error('AI ask error:', err)
    res.status(500).json({ message: 'AI service error' })
  }
})

// List sessions for the authenticated patient
router.get('/sessions', async (req, res) => {
  try {
    const patientId = await getPatientIdFromReq(req)
    if (!patientId) return res.status(401).json({ message: 'Patient auth required' })
    const sessions = await AIChatSession.find({ patientId }).sort({ lastUsedAt: -1 })
    res.json(sessions.map(s => ({ id: String(s._id), title: s.title || 'Chat', lastUsedAt: s.lastUsedAt })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// Get messages in a session (ensuring ownership)
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const patientId = await getPatientIdFromReq(req)
    if (!patientId) return res.status(401).json({ message: 'Patient auth required' })
    const session = await AIChatSession.findOne({ _id: req.params.id, patientId })
    if (!session) return res.status(404).json({ message: 'Session not found' })
    const msgs = await AIMessage.find({ sessionId: session._id }).sort({ createdAt: 1 })
    res.json(msgs.map(m => ({ id: String(m._id), role: m.role, text: m.text, createdAt: m.createdAt })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, AuthRequest } from '../../middleware/auth'

const router = Router()
const prisma = new PrismaClient()
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6'
router.use(authMiddleware)

// GET /api/ecosystem-map — the startup's own context (for the mapper's auto-fill)
// plus its saved map history, scoped to the startupId baked into the bridge token.
router.get('/ecosystem-map', async (req: AuthRequest, res) => {
  const startup = await prisma.startup.findUnique({ where: { id: req.startupId } })
  if (!startup) return res.status(404).json({ error: 'Startup not found' })
  res.json({
    startup: {
      name: startup.name, problem: startup.problem, solution: startup.solution,
      segment: startup.segment, stage: startup.stage, market: startup.market,
    },
    ecosystemMaps: startup.ecosystemMaps,
  })
})

router.put('/ecosystem-map', async (req: AuthRequest, res) => {
  const { ecosystemMaps } = req.body
  const startup = await prisma.startup.update({
    where: { id: req.startupId },
    data: { ecosystemMaps },
  })
  res.json({ ecosystemMaps: startup.ecosystemMaps })
})

// POST /api/ai/raw — generic system+prompt passthrough for the mapper's multi-stage
// AI generation pipeline. Mirrors launchpad_v5's own /api/ai/raw endpoint exactly
// (same request/response shape) so the ported ECO_JS engine needed no changes beyond
// which URL it points at.
router.post('/ai/raw', async (req, res) => {
  try {
    const { system, prompt, maxTokens } = req.body
    if (!system || !prompt) return res.status(400).json({ error: 'system and prompt are required' })
    const cappedTokens = Math.min(Number(maxTokens) || 1200, 4000)
    const msg = await client.messages.create({
      model: MODEL, max_tokens: cappedTokens, system, messages: [{ role: 'user', content: prompt }],
    })
    res.json({
      text: (msg.content[0] as any).text || '',
      inputTokens: msg.usage?.input_tokens || 0,
      outputTokens: msg.usage?.output_tokens || 0,
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export const ecosystemRouter = router

import './config/loadEnv'
import express from 'express'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { ecosystemRouter } from './routes/ecosystem/index'

const app = express()
// Sits behind the same AWS ALB/nginx as every other app here.
app.set('trust proxy', 1)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests' } })

app.use(helmet({ contentSecurityPolicy: false }))
// CORS must run before the rate limiter — otherwise a 429 response skips the
// Access-Control-Allow-Origin header and the browser reports a misleading
// "CORS policy" error instead of the real "too many requests".
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3500'], credentials: true }))
app.use('/api/', limiter)
app.use(express.json({ limit: '10mb' }))
app.use(morgan('tiny'))

app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'ecosystem-os-backend', version: '1.0.0', ts: new Date().toISOString() }))

app.use('/api', ecosystemRouter)

const PORT = Number(process.env.PORT) || 3501
app.listen(PORT, () => console.log(`Ecosystem OS API v1.0.0 running on :${PORT}`))
export default app

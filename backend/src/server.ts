
import express from 'express'
import cors from 'cors'
import type { Server } from 'http'

import publicSettingsRouter from './routes/publicSettings'
import publicCategoriesRouter from './routes/publicCategories'
import publicListingsRouter from './routes/publicListings'
import listingModerationRouter from './routes/listingModeration'
import categoryManagementRouter from './routes/categoryManagement'
import settingsManagementRouter from './routes/settingsManagement'
import reportsRouter from './routes/reports'
import automationManagementRouter from './routes/automationManagement'
import automationMonitoringRouter from './routes/automationMonitoring'
import automationRulesRouter from './routes/automationRules'
import notificationsRouter from './routes/notifications'

import authRouter from './routes/auth'
import authSessionRouter from './routes/authSession'

import adminRouter from './routes/admin'
import auditLogsRouter from './routes/auditLogs'

import {
  startAutomationWorker,
  stopAutomationWorker,
} from './automation/worker'

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.disable('x-powered-by')

// Allowed frontend origins
const allowedOrigins = [
  'http://localhost:5173',
  'https://mysterious-goblin-77wq6wqrv96qf4rw-5173.app.github.dev',
  process.env.FRONTEND_ORIGIN,
].filter((origin): origin is string => Boolean(origin))

// CORS configuration with session cookie support
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)

app.use(express.json({ limit: '100kb' }))

// Authentication routes
app.use('/api/auth', authRouter)
app.use('/api/auth', authSessionRouter)

// Personal notification routes
app.use('/api/notifications', notificationsRouter)

// Protected administration routes
app.use('/api/admin', adminRouter)
app.use('/api/admin', auditLogsRouter)
app.use('/api/admin/categories', categoryManagementRouter)
app.use('/api/admin/moderation', listingModerationRouter)
app.use('/api/admin/settings', settingsManagementRouter)
app.use('/api/admin/reports', reportsRouter)
app.use('/api/admin/automation', automationManagementRouter)
app.use('/api/admin/automation', automationMonitoringRouter)
app.use('/api/admin/automation', automationRulesRouter)

// API health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'SMART HELP MARKET BY BIGMAZ API',
    timestamp: new Date().toISOString(),
  })
})

// Public marketplace routes
app.use('/api/settings/public', publicSettingsRouter)
app.use('/api/categories/public', publicCategoriesRouter)
app.use('/api/listings/public', publicListingsRouter)

// Unknown endpoint handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
  })
})

// Start API server
const server: Server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`SMART HELP MARKET API listening on port ${PORT}`)

  // Worker starts only when explicitly enabled.
  startAutomationWorker()
})

// Graceful shutdown
let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  console.log(`${signal} received. Shutting down safely...`)

  try {
    await stopAutomationWorker()

    server.close((error) => {
      if (error) {
        console.error('API server shutdown failed:', error.message)
        process.exitCode = 1
      } else {
        console.log('API server stopped successfully.')
      }
    })
  } catch (error: unknown) {
    console.error(
      'Graceful shutdown failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )

    process.exitCode = 1
    server.close()
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

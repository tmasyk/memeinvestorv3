import express, { Express, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'

export class ApiServer {
  private app: Express
  private prisma: PrismaClient
  private presetManager: PresetManager

  constructor(prisma: PrismaClient, presetManager: PresetManager) {
    this.prisma = prisma
    this.presetManager = presetManager
    this.app = express()
    this.app.use(express.json())

    this.setupRoutes()
  }

  private setupRoutes() {
    // Health Check Endpoint
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        activePreset: this.presetManager.getActivePreset()
      })
    })

    // Trades Endpoint
    this.app.get('/api/trades', async (req: Request, res: Response) => {
      try {
        const trades = await this.prisma.paperTrade.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' }
        })
        res.json(trades)
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trades' })
      }
    })

    // Preset Endpoint
    this.app.post('/api/preset/:name', (req: Request, res: Response) => {
      const presetName = String(req.params.name)
      this.presetManager.loadPreset(presetName)
      res.json({ message: `Preset ${presetName} loaded successfully` })
    })
  }

  start(port: number) {
    this.app.listen(port, () => {
      console.log(`[ApiServer] Server running on port ${port}`)
    })
  }
}

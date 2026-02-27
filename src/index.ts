import { PrismaClient } from '@prisma/client'
import { config } from './core/config'
import { RpcConnectionManager } from './core/RpcConnectionManager'
import { EventBus } from './core/EventBus'
import { ScannerService } from './services/ScannerService'
import { TradingEngine } from './services/TradingEngine'
import { PositionManager } from './services/PositionManager'
import { PositionMonitor } from './services/PositionMonitor'
import { PresetManager } from './core/PresetManager'
import { TelegramService } from './services/TelegramService'
import { RaydiumScanner } from './services/RaydiumScanner'

// Plugins
import { MinLiquidityFilter } from './plugins/filters/MinLiquidityFilter'
import { MintRevokedCheck } from './plugins/risk/MintRevokedCheck'
import { GiniConcentrationRisk } from './plugins/risk/GiniConcentrationRisk'
import { FixedRiskStrategy } from './plugins/strategies/FixedRiskStrategy'
import { TrailingStopStrategy } from './plugins/strategies/TrailingStopStrategy'
import { TimeBasedExitStrategy } from './plugins/strategies/TimeBasedExitStrategy'
import { VelocityPumpStrategy } from './plugins/strategies/VelocityPumpStrategy'
import { MoonbagStrategy } from './plugins/strategies/MoonbagStrategy'

// Global Error Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[System] Unhandled Rejection:', reason)
  // Do not exit the process for unhandled rejections (often network/telegram related)
})

process.on('uncaughtException', (error) => {
  console.error('[System] Uncaught Exception:', error)
  // Do not exit the process for uncaught exceptions
})

async function main() {
  console.log('🚀 Booting MemeInvestor V3...')

  // 1. Initialize Core
  const prisma = new PrismaClient()
  const eventBus = EventBus.getInstance()
  const rpcManager = RpcConnectionManager.getInstance({
    heartbeatTimeoutMs: 15000,
    reconnectDelayMs: 5000
  })

  // 2. Initialize Plugins
  const filters = [
    new MinLiquidityFilter(1000) // Default safe-ish
  ]
  
  const riskPlugins = [
    new MintRevokedCheck(),
    new GiniConcentrationRisk()
  ]

  // 3. Initialize Services
  const scannerService = new ScannerService(filters, riskPlugins, prisma)
  const positionManager = new PositionManager()
  
  // Default strategy to start - will be overridden by PresetManager
  const defaultStrategy = new FixedRiskStrategy(50, 10) 
  
  let telegramService: TelegramService | undefined
  try {
    telegramService = new TelegramService(config.telegramBotToken, new PresetManager(), prisma)
  } catch (error) {
    console.error('[Telegram] AUTH FAILURE: Check your token in .env. Continuing without Telegram...')
  }
  
  const positionMonitor = new PositionMonitor(
    prisma, 
    positionManager, 
    defaultStrategy,
    telegramService
  )

  const tradingEngine = new TradingEngine(prisma, positionManager)

  const presetManager = new PresetManager()
  // Load default preset
  presetManager.loadPreset('bluechip_safe')

  const raydiumScanner = new RaydiumScanner(scannerService)

  // 4. Start Connections
  console.log('[System] Connecting to Solana RPC...')
  rpcManager.connect()

  rpcManager.on('connected', () => {
    console.log('[System] RPC Connected.')
  })

  // 5. Start Raydium Scanner
  console.log('[System] Starting Raydium Scanner...')
  raydiumScanner.start()

  console.log(`[System] V3 Engine Online. Environment: ${config.env}`)
  console.log('[System] Listening for Raydium Initializations...')

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('Shutting down...')
    rpcManager.disconnect()
    await prisma.$disconnect()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Fatal Error:', error)
  process.exit(1)
})

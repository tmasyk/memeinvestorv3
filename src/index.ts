import { PrismaClient } from '@prisma/client'
import { config } from './core/config'
import { RpcConnectionManager } from './core/RpcConnectionManager'
import { EventBus } from './core/EventBus'
import { ScannerService } from './services/ScannerService'
import { TradingEngine } from './services/TradingEngine'
import { PaperTradingService } from './services/PaperTradingService'
import { PositionManager } from './services/PositionManager'
import { PositionMonitor } from './services/PositionMonitor'
import { PresetManager } from './core/PresetManager'
import { TelegramService } from './services/TelegramService'
import { RaydiumScanner } from './services/RaydiumScanner'
import { DailyReportService } from './services/DailyReportService'

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
})

process.on('uncaughtException', (error) => {
  console.error('[System] Uncaught Exception:', error)
})

async function main() {
  console.log('🚀 Booting MemeInvestor V3...')

  // 1. Initialize Core Services
  const prisma = new PrismaClient({
    log: config.env === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: config.databaseUrl
      }
    }
  })
  const eventBus = EventBus.getInstance()
  const rpcManager = RpcConnectionManager.getInstance({
    heartbeatTimeoutMs: 15000,
    reconnectDelayMs: 5000
  })

  // 2. Initialize Plugins
  const filters = [
    new MinLiquidityFilter(1000)
  ]
  
  const riskPlugins = [
    new MintRevokedCheck(),
    new GiniConcentrationRisk()
  ]

  // 3. Initialize Services
  const scannerService = new ScannerService(filters, riskPlugins, prisma)
  const positionManager = new PositionManager()
  
  const presetManager = new PresetManager(prisma)
  await presetManager.loadPreset('bluechip_safe')

  const defaultStrategy = new FixedRiskStrategy(50, 10) 
  
  let telegramService: TelegramService | undefined
  try {
    telegramService = new TelegramService(config.telegramBotToken, presetManager, prisma)
  } catch (error) {
    console.error('[Telegram] AUTH FAILURE: Check your token in .env. Continuing without Telegram...')
  }
  
  const positionMonitor = new PositionMonitor(
    prisma, 
    positionManager, 
    defaultStrategy,
    telegramService
  )

  // Select trading engine based on LIVE_TRADING_ENABLED
  const tradingEngine = config.liveTradingEnabled 
    ? new TradingEngine(prisma, positionManager)
    : new PaperTradingService(prisma, positionManager)

  console.log(`[System] Trading Mode: ${config.liveTradingEnabled ? 'LIVE' : 'PAPER (SIMULATION)'}`)

  const dailyReportService = new DailyReportService(prisma, telegramService)

  const raydiumScanner = new RaydiumScanner(scannerService)

  // 4. Start Connections
  console.log('[System] Connecting to Solana RPC...')
  rpcManager.connect()

  rpcManager.on('connected', () => {
    console.log('[System] RPC Connected.')
  })

  rpcManager.on('disconnected', () => {
    console.warn('[System] RPC Disconnected. Reconnecting in 5s...')
  })

  // 5. Start Raydium Scanner
  console.log('[System] Starting Raydium Scanner...')
  await raydiumScanner.start()

  // 6. Start Daily Report Service
  console.log('[System] Starting Daily Report Service...')
  dailyReportService.start()

  console.log(`[System] V3 Engine Online. Environment: ${config.env}`)
  console.log('[System] Listening for Raydium Initializations...')

  // Graceful Shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...')
    await raydiumScanner.stop()
    dailyReportService.stop()
    rpcManager.disconnect()
    await prisma.$disconnect()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Fatal Error:', error)
  process.exit(1)
})

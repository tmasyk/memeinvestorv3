import { PrismaClient } from '@prisma/client'
import { EventBus, EventName } from '../core/EventBus'
import { PositionManager } from '../services/PositionManager'
import { FixedRiskStrategy } from '../plugins/strategies/FixedRiskStrategy'
import { ScannerService } from '../services/ScannerService'
import { TradingEngine } from '../services/TradingEngine'
import { PositionMonitor } from '../services/PositionMonitor'
import { MinLiquidityFilter } from '../plugins/filters/MinLiquidityFilter'
import { MintRevokedCheck } from '../plugins/risk/MintRevokedCheck'

// Initialize Core Services
const prisma = new PrismaClient()
const eventBus = EventBus.getInstance()
const positionManager = new PositionManager()

// Initialize Plugins
const minLiquidityFilter = new MinLiquidityFilter()
const mintRevokedCheck = new MintRevokedCheck()
const strategy = new FixedRiskStrategy(20, 10) // 20% TP, 10% SL

// Initialize Major Services
const scannerService = new ScannerService(
  [minLiquidityFilter],
  [mintRevokedCheck],
  prisma
)

const tradingEngine = new TradingEngine(prisma, positionManager)

const positionMonitor = new PositionMonitor(prisma, positionManager, strategy)

// Helper for delays
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  try {
    console.log('[System] Booting up MemeInvestor V3...')

    // 1. Clear Database
    console.log('[System] Clearing database...')
    await prisma.paperTrade.deleteMany()
    await prisma.pendingTrade.deleteMany()
    await prisma.token.deleteMany()

    // 2. Mock Token Data
    const mockToken = {
      address: 'FULL_LOOP_TOKEN_123',
      symbol: 'LOOP',
      name: 'Full Loop Token',
      decimals: 6,
      liquidity: 50000,
      volume24h: 100000
    }

    // 3. Start Simulation Flow
    console.log('\n--- Step 1: Token Discovery ---')
    // We manually trigger the scanner service to simulate "New Token Discovered"
    await scannerService.processNewToken(mockToken)

    // Wait for the Event Bus to route TRADE_QUEUED -> TradingEngine
    await wait(500)

    // Verify Trade Queued & Executed
    const trade = await prisma.paperTrade.findFirst({
      where: { tokenAddress: mockToken.address }
    })

    if (trade && trade.status === 'OPEN') {
      console.log(`[Test] Trade Successfully Opened at $${trade.entryPrice}`)
    } else {
      console.error('[Test] Trade failed to open!')
      process.exit(1)
    }

    console.log('\n--- Step 2: Price Update (Pump) ---')
    // Simulate a 30% Pump (Entry 0.05 -> Current 0.065)
    const mockPrices = {
      [mockToken.address]: 0.065
    }

    // Emit PRICE_UPDATED -> PositionMonitor
    eventBus.emit(EventName.PRICE_UPDATED, mockPrices)

    // Wait for PositionMonitor -> Strategy -> Database Update
    await wait(500)

    console.log('\n--- Step 3: Final Verification ---')
    
    // Check Database State
    const closedTrade = await prisma.paperTrade.findFirst({
      where: { tokenAddress: mockToken.address }
    })

    const token = await prisma.token.findUnique({
      where: { address: mockToken.address }
    })

    console.log('Final Database State:')
    console.log(`Token Status: ${token?.status}`)
    console.log(`Trade Status: ${closedTrade?.status}`)
    console.log(`Exit Price: $${closedTrade?.exitPrice}`)
    console.log(`Exit Reason: ${closedTrade?.exitReason}`)

    if (closedTrade?.status === 'CLOSED' && closedTrade?.exitReason === 'TAKE_PROFIT') {
      console.log('\nSUCCESS: Full Loop Completed! 🚀')
    } else {
      console.error('\nFAILURE: Trade did not close correctly.')
    }

  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

import { PrismaClient } from '@prisma/client'
import { PositionManager } from '../services/PositionManager'
import { MoonbagStrategy } from '../plugins/strategies/MoonbagStrategy'
import { PositionMonitor } from '../services/PositionMonitor'
import { TelegramService } from '../services/TelegramService'

const prisma = new PrismaClient()
const positionManager = new PositionManager()
const strategy = new MoonbagStrategy()

// Mock Telegram Service
const telegramService = new TelegramService('dummy', new (class { } as any), prisma)
// Override sendTradeAlert to just log to console for verification
telegramService.sendTradeAlert = async (trade, type, pnl) => {
  console.log(`\n[MOCK TELEGRAM] Alert Sent: ${type} | PnL: ${pnl.toFixed(2)}%`)
  console.log(`Token: ${trade.tokenAddress} | Reason: ${trade.exitReason || 'Partial Exit'}`)
}

const positionMonitor = new PositionMonitor(prisma, positionManager, strategy, telegramService)

async function main() {
  console.log('=== Testing Moonbag Strategy & Alerts ===')

  try {
    // 1. Clear Database
    console.log('Clearing PaperTrades table...')
    await prisma.paperTrade.deleteMany()

    // 2. Insert Mock Trade
    console.log('Inserting mock trade...')
    const trade = await prisma.paperTrade.create({
      data: {
        tokenAddress: 'MOON_TOKEN_DB',
        amount: 1000,
        entryPrice: 1.00,
        status: 'OPEN',
        didTakeInitialProfit: false,
        remainingAmount: 1000
      }
    })

    // Manually track
    positionManager.trackPosition('MOON_TOKEN_DB')

    // --- Tick 1: Price 2x -> Should Sell 50% ---
    console.log('\n--- Tick 1: Price -> $2.00 (2x) ---')
    await positionMonitor.evaluateOpenPositions({ 'MOON_TOKEN_DB': 2.00 })

    // Verify DB State
    const tradeAfterTick1 = await prisma.paperTrade.findUnique({ where: { id: trade.id } })
    
    if (
      tradeAfterTick1?.didTakeInitialProfit === true &&
      tradeAfterTick1?.remainingAmount === 500 &&
      tradeAfterTick1?.status === 'OPEN'
    ) {
      console.log('SUCCESS: DB updated correctly (Profit Taken, 500 remaining, OPEN)')
    } else {
      console.error('FAILURE: DB state incorrect after partial sell')
      console.log('State:', tradeAfterTick1)
    }

    // --- Tick 2: Price 5x -> Should Update Watermark (No Exit) ---
    console.log('\n--- Tick 2: Price -> $5.00 (Pump) ---')
    await positionMonitor.evaluateOpenPositions({ 'MOON_TOKEN_DB': 5.00 })
    
    const tradeAfterTick2 = await prisma.paperTrade.findUnique({ where: { id: trade.id } })
    if (tradeAfterTick2?.status === 'OPEN') {
      console.log('SUCCESS: Trade remains OPEN on pump')
    } else {
      console.error('FAILURE: Trade closed prematurely')
    }

    // --- Tick 3: Price Drop 30% ($3.50) -> Should Close Remaining ---
    console.log('\n--- Tick 3: Price -> $3.50 (Dump) ---')
    await positionMonitor.evaluateOpenPositions({ 'MOON_TOKEN_DB': 3.50 })

    const tradeAfterTick3 = await prisma.paperTrade.findUnique({ where: { id: trade.id } })
    
    if (
      tradeAfterTick3?.status === 'CLOSED' &&
      tradeAfterTick3?.remainingAmount === 0 &&
      tradeAfterTick3?.exitReason === 'MOONBAG_EXIT'
    ) {
      console.log('SUCCESS: Trade fully CLOSED on trailing stop')
    } else {
      console.error('FAILURE: Trade did not close correctly')
      console.log('State:', tradeAfterTick3)
    }

  } catch (error) {
    console.error('Test Failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

import { PrismaClient } from '@prisma/client'
import { PositionManager } from '../services/PositionManager'
import { TrailingStopStrategy } from '../plugins/strategies/TrailingStopStrategy'
import { PositionMonitor } from '../services/PositionMonitor'

const prisma = new PrismaClient()
const positionManager = new PositionManager()

// Strategy: 15% Trailing Stop
const strategy = new TrailingStopStrategy(15)

const positionMonitor = new PositionMonitor(prisma, positionManager, strategy)

async function main() {
  try {
    console.log('=== Testing Trailing Stop Strategy ===')

    // 1. Clear Database
    console.log('Clearing PaperTrades table...')
    await prisma.paperTrade.deleteMany()

    // 2. Insert Mock Trade
    console.log('Inserting mock trade...')
    await prisma.paperTrade.create({
      data: {
        tokenAddress: 'TOKEN_TRAIL',
        amount: 1000,
        entryPrice: 1.00,
        status: 'OPEN'
      }
    })

    // Manually track positions in PositionManager
    positionManager.trackPosition('TOKEN_TRAIL')

    // 3. Simulate Price Movement
    
    // Tick 1: Price pumps to $1.50 (New High Watermark)
    console.log('\nTick 1: Price -> $1.50')
    await positionMonitor.evaluateOpenPositions({ 'TOKEN_TRAIL': 1.50 })

    // Tick 2: Price pumps to $2.00 (New High Watermark)
    console.log('Tick 2: Price -> $2.00')
    await positionMonitor.evaluateOpenPositions({ 'TOKEN_TRAIL': 2.00 })

    // Tick 3: Price dumps to $1.60 (20% drop from $2.00) -> Should Trigger Exit (15% Trail)
    console.log('Tick 3: Price -> $1.60')
    await positionMonitor.evaluateOpenPositions({ 'TOKEN_TRAIL': 1.60 })

    // 5. Verify Results
    console.log('\n=== Verification ===')
    const closedTrade = await prisma.paperTrade.findFirst({
      where: { tokenAddress: 'TOKEN_TRAIL' }
    })

    if (closedTrade?.status === 'CLOSED') {
      console.log(`Trade Closed at $${closedTrade.exitPrice}`)
      console.log(`Reason: ${closedTrade.exitReason}`)

      if (closedTrade.exitReason === 'TRAILING_STOP') {
        console.log('\nSUCCESS: Trailing Stop triggered correctly.')
      } else {
        console.error('\nFAILURE: Incorrect exit reason.')
      }
    } else {
      console.error('\nFAILURE: Trade did not close.')
    }

  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

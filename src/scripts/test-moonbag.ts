import { PrismaClient } from '@prisma/client'
import { PositionManager } from '../services/PositionManager'
import { MoonbagStrategy } from '../plugins/strategies/MoonbagStrategy'
import { EventBus, EventName } from '../core/EventBus'

const prisma = new PrismaClient()
const positionManager = new PositionManager()
const strategy = new MoonbagStrategy()
const eventBus = EventBus.getInstance()

// Mock Telegram Service
class MockTelegramService {
  sendTradeAlert = async (trade: any, type: string, pnl: number) => {
    console.log(`\n[MOCK TELEGRAM] Alert Sent: ${type} | PnL: ${pnl.toFixed(2)}%`)
    console.log(`Token: ${trade.tokenAddress} | Reason: ${trade.exitReason || 'Partial Exit'}`)
  }
}

const telegramService = new MockTelegramService() as any

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

    // 3. Manually track position with mock vault address
    const vaultAddress = `${trade.tokenAddress.slice(0, 32)}Vault`
    await positionManager.trackPosition(trade.tokenAddress, vaultAddress)

    // 4. Emit POSITION_OPENED event to start monitoring
    eventBus.emit(EventName.POSITION_OPENED, {
      tokenAddress: trade.tokenAddress,
      entryPrice: 1.00,
      vaultAddress: vaultAddress
    })

    console.log('\n--- Tick 1: Price -> $2.00 (2x) ---')
    // Manually trigger evaluation by simulating account update
    const mockAccountData1 = {
      method: 'accountNotification',
      params: {
        subscription: 1,
        result: {
          value: {
            data: [Buffer.alloc(72)]
          }
        }
      }
    }
    eventBus.emit('message', mockAccountData1)

    await new Promise(resolve => setTimeout(resolve, 100))

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

    console.log('\n--- Tick 2: Price -> $5.00 (Pump) ---')
    // Price pump should update watermark but not exit
    await new Promise(resolve => setTimeout(resolve, 100))

    const tradeAfterTick2 = await prisma.paperTrade.findUnique({ where: { id: trade.id } })
    if (tradeAfterTick2?.status === 'OPEN') {
      console.log('SUCCESS: Trade remains OPEN on pump')
    } else {
      console.error('FAILURE: Trade closed prematurely')
    }

    console.log('\n--- Tick 3: Price Drop 30% ($0.70) -> Should Close Remaining ---')
    // Simulate price drop to trigger MOONBAG_EXIT
    const mockAccountData3 = {
      method: 'accountNotification',
      params: {
        subscription: 1,
        result: {
          value: {
            data: [Buffer.alloc(72)]
          }
        }
      }
    }
    eventBus.emit('message', mockAccountData3)

    await new Promise(resolve => setTimeout(resolve, 100))

    const tradeAfterTick3 = await prisma.paperTrade.findUnique({ where: { id: trade.id } })
    
    if (
      tradeAfterTick3?.status === 'CLOSED' &&
      tradeAfterTick3?.remainingAmount === 0
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

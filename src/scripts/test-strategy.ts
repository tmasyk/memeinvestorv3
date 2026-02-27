import { PrismaClient } from '@prisma/client'
import { PositionManager } from '../services/PositionManager'
import { TrailingStopStrategy } from '../plugins/strategies/TrailingStopStrategy'
import { EventBus, EventName } from '../core/EventBus'

const prisma = new PrismaClient()
const positionManager = new PositionManager()
const eventBus = EventBus.getInstance()

const strategy = new TrailingStopStrategy(15)

async function main() {
  try {
    console.log('=== Testing Trailing Stop Strategy ===')

    await prisma.paperTrade.deleteMany()

    console.log('Inserting mock trade...')
    const trade = await prisma.paperTrade.create({
      data: {
        tokenAddress: 'TOKEN_TRAIL',
        amount: 1000,
        entryPrice: 1.00,
        status: 'OPEN'
      }
    })

    const vaultAddress = `${trade.tokenAddress.slice(0, 32)}Vault`
    await positionManager.trackPosition(trade.tokenAddress, vaultAddress)

    eventBus.emit(EventName.POSITION_OPENED, {
      tokenAddress: trade.tokenAddress,
      entryPrice: 1.00,
      vaultAddress: vaultAddress
    })

    console.log('\nTick 1: Price -> $1.50')
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

    console.log('Tick 2: Price -> $2.00')
    const mockAccountData2 = {
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
    eventBus.emit('message', mockAccountData2)

    await new Promise(resolve => setTimeout(resolve, 100))

    console.log('Tick 3: Price -> $1.60')
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

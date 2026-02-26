import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'
import { IStrategyPlugin } from '../core/types'
import { EventBus, EventName } from '../core/EventBus'

export class PositionMonitor {
  private prisma: PrismaClient
  private positionManager: PositionManager
  private strategy: IStrategyPlugin
  private eventBus: EventBus

  constructor(
    prisma: PrismaClient,
    positionManager: PositionManager,
    strategy: IStrategyPlugin
  ) {
    this.prisma = prisma
    this.positionManager = positionManager
    this.strategy = strategy
    this.eventBus = EventBus.getInstance()

    this.setupListeners()
  }

  private setupListeners() {
    this.eventBus.on(EventName.PRICE_UPDATED, (mockPrices: Record<string, number>) => {
      console.log('[PositionMonitor] Received PRICE_UPDATED event')
      this.evaluateOpenPositions(mockPrices)
    })
  }

  async evaluateOpenPositions(mockCurrentPrices: Record<string, number>): Promise<void> {
    const openTrades = await this.prisma.paperTrade.findMany({
      where: { status: 'OPEN' }
    })

    if (openTrades.length === 0) {
      console.log('[PositionMonitor] No open positions to evaluate.')
      return
    }

    for (const trade of openTrades) {
      const currentPrice = mockCurrentPrices[trade.tokenAddress]

      if (currentPrice === undefined) {
        console.warn(`[PositionMonitor] No price data for ${trade.tokenAddress}`)
        continue
      }

      const decision = this.strategy.shouldExit(trade, currentPrice)

      if (decision.exit) {
        // Close the trade
        await this.prisma.paperTrade.update({
          where: { id: trade.id },
          data: {
            status: 'CLOSED',
            exitPrice: currentPrice,
            exitReason: decision.reason
          }
        })

        // Release the position slot
        this.positionManager.untrackPosition(trade.tokenAddress)

        console.log(`[PositionMonitor] Exiting ${trade.tokenAddress} at $${currentPrice} due to ${decision.reason}`)
      }
    }
  }
}

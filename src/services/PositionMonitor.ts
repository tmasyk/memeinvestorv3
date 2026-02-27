import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'
import { IStrategyPlugin } from '../core/types'
import { EventBus, EventName } from '../core/EventBus'
import { TelegramService } from './TelegramService'

export class PositionMonitor {
  private prisma: PrismaClient
  private positionManager: PositionManager
  private strategy: IStrategyPlugin
  private eventBus: EventBus
  private telegramService?: TelegramService

  constructor(
    prisma: PrismaClient,
    positionManager: PositionManager,
    strategy: IStrategyPlugin,
    telegramService?: TelegramService
  ) {
    this.prisma = prisma
    this.positionManager = positionManager
    this.strategy = strategy
    this.eventBus = EventBus.getInstance()
    this.telegramService = telegramService

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
        if (decision.amountPercent && decision.amountPercent < 100) {
          // Partial Exit (Moonbag)
          const remainingPercent = 100 - decision.amountPercent
          const initialAmount = trade.amount
          const newAmount = initialAmount * (remainingPercent / 100)

          await this.prisma.paperTrade.update({
            where: { id: trade.id },
            data: {
              didTakeInitialProfit: true,
              remainingAmount: newAmount,
              // Do NOT set status to CLOSED
            }
          })

          console.log(`[PositionMonitor] Partial Exit (${decision.amountPercent}%) for ${trade.tokenAddress} at $${currentPrice}. Remaining: ${newAmount}`)
          
          // Send Alert
          const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          await this.telegramService?.sendTradeAlert(trade, 'PARTIAL', pnl)
        } else {
          // Full Exit
          await this.prisma.paperTrade.update({
            where: { id: trade.id },
            data: {
              status: 'CLOSED',
              exitPrice: currentPrice,
              exitReason: decision.reason,
              remainingAmount: 0
            }
          })

          // Release the position slot
          this.positionManager.untrackPosition(trade.tokenAddress)

          console.log(`[PositionMonitor] Full Exit ${trade.tokenAddress} at $${currentPrice} due to ${decision.reason}`)
          
          // Send Alert
          const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          await this.telegramService?.sendTradeAlert({ ...trade, exitReason: decision.reason }, 'FULL', pnl)
        }
      }
    }
  }
}

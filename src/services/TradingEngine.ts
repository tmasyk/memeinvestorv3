import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'

export class TradingEngine {
  private prisma: PrismaClient
  private positionManager: PositionManager

  constructor(prisma: PrismaClient, positionManager: PositionManager) {
    this.prisma = prisma
    this.positionManager = positionManager
  }

  async processQueue(): Promise<void> {
    const pendingTrade = await this.prisma.pendingTrade.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' }
    })

    if (!pendingTrade) {
      console.log('[TradingEngine] No queued trades found.')
      return
    }

    console.log(`[TradingEngine] Processing trade for ${pendingTrade.tokenAddress}...`)

    await this.prisma.pendingTrade.update({
      where: { id: pendingTrade.id },
      data: { status: 'PROCESSING' }
    })

    // Simulate Jito Execution
    await new Promise(resolve => setTimeout(resolve, 100))

    const canTrade = this.positionManager.trackPosition(pendingTrade.tokenAddress)

    if (canTrade) {
      await this.prisma.paperTrade.create({
        data: {
          tokenAddress: pendingTrade.tokenAddress,
          amount: 1,
          entryPrice: 0.05,
          status: 'OPEN'
        }
      })

      await this.prisma.pendingTrade.update({
        where: { id: pendingTrade.id },
        data: { status: 'EXECUTED' }
      })

      console.log(`[TradingEngine] Trade EXECUTED for ${pendingTrade.tokenAddress}`)
    } else {
      await this.prisma.pendingTrade.update({
        where: { id: pendingTrade.id },
        data: { status: 'FAILED' }
      })
      
      console.warn(`[TradingEngine] Trade FAILED for ${pendingTrade.tokenAddress} (Max positions reached)`)
    }
  }

  async monitorAndExit(tokenAddress: string): Promise<void> {
    const trade = await this.prisma.paperTrade.findFirst({
      where: {
        tokenAddress: tokenAddress,
        status: 'OPEN'
      }
    })

    if (!trade) {
      console.warn(`[TradingEngine] No open trade found for ${tokenAddress}`)
      return
    }

    // Simulate hitting Take-Profit
    await new Promise(resolve => setTimeout(resolve, 100))

    await this.prisma.paperTrade.update({
      where: { id: trade.id },
      data: {
        status: 'CLOSED',
        exitPrice: 0.10
      }
    })

    this.positionManager.untrackPosition(tokenAddress)
    console.log(`[TradingEngine] Trade CLOSED for ${tokenAddress}`)
  }
}

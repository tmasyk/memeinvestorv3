import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'
import { EventBus, EventName } from '../core/EventBus'
import { JitoManager } from '../core/JitoManager'

export class PaperTradingService {
  private prisma: PrismaClient
  private positionManager: PositionManager
  private eventBus: EventBus
  private jitoManager: JitoManager

  constructor(prisma: PrismaClient, positionManager: PositionManager) {
    this.prisma = prisma
    this.positionManager = positionManager
    this.eventBus = EventBus.getInstance()
    this.jitoManager = JitoManager.getInstance()

    this.setupListeners()
  }

  private setupListeners() {
    this.eventBus.on(EventName.TRADE_QUEUED, () => {
      console.log('[PaperTradingService] Received TRADE_QUEUED event')
      this.processQueue()
    })
  }

  async processQueue(): Promise<void> {
    const pendingTrade = await this.prisma.pendingTrade.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' }
    })

    if (!pendingTrade) {
      console.log('[PaperTradingService] No queued trades found.')
      return
    }

    console.log(`[PaperTradingService] Processing paper trade for ${pendingTrade.tokenAddress}...`)

    await this.prisma.pendingTrade.update({
      where: { id: pendingTrade.id },
      data: { status: 'PROCESSING' }
    })

    const buyAmount = 0.05
    if (buyAmount > 0.05) {
      throw new Error("Safety: Buy amount exceeds test limit")
    }

    console.log(`[PaperTradingService] 📊 PAPER MODE: Simulating Jito bundle for ${pendingTrade.tokenAddress}`)

    const canExecute = await this.jitoManager.simulateBundle(`sim-${pendingTrade.id}`)

    if (!canExecute) {
      console.warn(`[PaperTradingService] Jito Simulation Failed for ${pendingTrade.tokenAddress}. Skipping paper trade.`)

      await this.prisma.pendingTrade.update({
        where: { id: pendingTrade.id },
        data: { status: 'FAILED' }
      })

      try {
        await this.prisma.discovery.updateMany({
          where: { tokenAddress: pendingTrade.tokenAddress },
          data: {
            reason: 'Jito Simulation Failed'
          }
        })
        console.log(`[PaperTradingService] Logged simulation failure for ${pendingTrade.tokenAddress}`)
      } catch (e) {
        console.error('[PaperTradingService] Failed to update discovery:', e)
      }

      return
    }

    const vaultAddress = this.generateMockVaultAddress(pendingTrade.tokenAddress)
    const canTrade = await this.positionManager.trackPosition(pendingTrade.tokenAddress, vaultAddress)

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

      console.log(`[PaperTradingService] ✅ Paper trade OPENED for ${pendingTrade.tokenAddress}`)
      this.eventBus.emit(EventName.POSITION_OPENED, { 
        tokenAddress: pendingTrade.tokenAddress,
        vaultAddress: vaultAddress,
        entryPrice: 0.05
      })
    } else {
      await this.prisma.pendingTrade.update({
        where: { id: pendingTrade.id },
        data: { status: 'FAILED' }
      })

      console.warn(`[PaperTradingService] Paper trade FAILED for ${pendingTrade.tokenAddress} (Max positions reached)`)
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
      console.warn(`[PaperTradingService] No open paper trade found for ${tokenAddress}`)
      return
    }

    await this.prisma.paperTrade.update({
      where: { id: trade.id },
      data: {
        status: 'CLOSED',
        exitPrice: 0.10
      }
    })

    await this.positionManager.untrackPosition(tokenAddress)
    console.log(`[PaperTradingService] Paper trade CLOSED for ${tokenAddress}`)
  }

  private generateMockVaultAddress(tokenAddress: string): string {
    return `${tokenAddress.slice(0, 32)}Vault`
  }
}

import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'
import { EventBus, EventName } from '../core/EventBus'
import { JitoManager } from '../core/JitoManager'
import { RequestDispatcher, RequestPriority } from '../core/RequestDispatcher'
import { PresetManager } from '../core/PresetManager'

export class PaperTradingService {
  private prisma: PrismaClient
  private positionManager: PositionManager
  private eventBus: EventBus
  private jitoManager: JitoManager
  private requestDispatcher: RequestDispatcher
  private presetManager: PresetManager

  constructor(prisma: PrismaClient, positionManager: PositionManager, presetManager?: PresetManager) {
    this.prisma = prisma
    this.positionManager = positionManager
    this.eventBus = EventBus.getInstance()
    this.jitoManager = JitoManager.getInstance()
    this.requestDispatcher = RequestDispatcher.getInstance()
    this.presetManager = presetManager || new PresetManager(prisma)

    this.setupListeners()
  }

  private setupListeners() {
    this.eventBus.on(EventName.TRADE_QUEUED, (data: any) => {
      console.log('[PaperTradingService] Received TRADE_QUEUED event')
      this.processQueue(data)
    })

    this.eventBus.on(EventName.POSITION_OPENED, (data: any) => {
      console.log('[PaperTradingService] Position opened, starting PnL monitoring')
      this.monitorPnL(data.tokenAddress, data.entryPrice)
    })
  }

  async processQueue(data?: any): Promise<void> {
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

    const poolDetectedTime = data?.poolDetectedTime || Date.now()
    const simulationResult = await this.requestDispatcher.executeRequest(
      () => this.jitoManager.simulateBundle(
        `sim-${pendingTrade.id}`,
        pendingTrade.tokenAddress,
        poolDetectedTime
      ),
      RequestPriority.CRITICAL
    )

    if (!simulationResult.success) {
      console.warn(`[PaperTradingService] Jito Simulation Failed for ${pendingTrade.tokenAddress}. Skipping paper trade.`)

      await this.prisma.pendingTrade.update({
        where: { id: pendingTrade.id },
        data: { status: 'FAILED' }
      })

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

  private async monitorPnL(tokenAddress: string, entryPrice: number): Promise<void> {
    const trade = await this.prisma.paperTrade.findFirst({
      where: {
        tokenAddress: tokenAddress,
        status: 'OPEN'
      }
    })

    if (!trade) {
      console.warn(`[PaperTradingService] No open paper trade found for PnL monitoring: ${tokenAddress}`)
      return
    }

    const discovery = await this.prisma.discovery.findFirst({
      where: { tokenAddress }
    })

    const source = discovery?.source || 'SNIPER'

    const currentPrice = trade.exitPrice || entryPrice
    const profitPercentage = ((currentPrice - entryPrice) / entryPrice) * 100

    if (currentPrice > entryPrice * 1.20) {
      const activePreset = this.presetManager.getActivePresetConfig()

      this.eventBus.emit(EventName.PROFIT_ALERT, {
        tokenAddress,
        profitPercentage,
        currentPrice,
        entryPrice,
        presetName: activePreset?.name || 'Unknown',
        source
      })

      console.log(`[PaperTradingService] 🚀 PROFIT ALERT: +${profitPercentage.toFixed(2)}% | Token: ${tokenAddress} | Preset: ${activePreset?.name || 'Unknown'} | Source: ${source}`)
    }
  }

  private generateMockVaultAddress(tokenAddress: string): string {
    return `${tokenAddress.slice(0, 32)}Vault`
  }
}

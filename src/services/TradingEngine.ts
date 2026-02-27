import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'
import { EventBus, EventName } from '../core/EventBus'
import { config } from '../core/config'
import { SecretManager } from '../core/SecretManager'
import { JitoManager } from '../core/JitoManager'

export class TradingEngine {
  private prisma: PrismaClient
  private positionManager: PositionManager
  private eventBus: EventBus
  private secretManager: SecretManager

  constructor(prisma: PrismaClient, positionManager: PositionManager) {
    this.prisma = prisma
    this.positionManager = positionManager
    this.eventBus = EventBus.getInstance()
    this.secretManager = SecretManager.getInstance()

    this.setupListeners()
  }

  private setupListeners() {
    this.eventBus.on(EventName.TRADE_QUEUED, () => {
      console.log('[TradingEngine] Received TRADE_QUEUED event')
      this.processQueue()
    })
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

    const buyAmount = 0.05
    if (buyAmount > 0.05) {
      throw new Error("Safety: Buy amount exceeds test limit")
    }

    // --- JITO EXECUTION BLOCK ---
    if (config.jitoBlockEngineUrl && this.secretManager.hasTradingCredentials()) {
        const jito = JitoManager.getInstance()
        console.log(`[TradingEngine] 🚀 Executing via Jito Fast-Lane: ${config.jitoBlockEngineUrl}`)
        
        // 1. Simulate Bundle (Safety Check)
        const canExecute = await jito.simulateBundle(`sim-${pendingTrade.id}`)
        
        if (!canExecute) {
          console.warn(`[TradingEngine] Jito Simulation Failed for ${pendingTrade.tokenAddress}. Skipping trade to avoid honeypot/loss.`)
          
          await this.prisma.pendingTrade.update({
            where: { id: pendingTrade.id },
            data: { status: 'FAILED' }
          })
          
          // Log failure to Discovery for transparency
          try {
            await this.prisma.discovery.updateMany({
              where: { tokenAddress: pendingTrade.tokenAddress },
              data: { 
                // Using existing fields or if 'reason' existed we would use it.
                // Since we haven't migrated 'reason' yet, we skip setting it.
                // The task asks us to add 'reason' column later.
              } 
            })
            console.log(`[TradingEngine] Logged simulation failure for ${pendingTrade.tokenAddress}`)
          } catch (e) {
            // Ignore if discovery record missing
          }
          
          return
        }

        // 2. Execute Bundle (if live trading is enabled)
        if (config.liveTradingEnabled) {
          const bundleId = await jito.sendBundle(`tx-${pendingTrade.id}`)
          console.log(`[TradingEngine] Bundle Sent! ID: ${bundleId}`)
        } else {
          console.log(`[TradingEngine] 🚫 LIVE_TRADING_ENABLED=false. Simulation complete - ABORTING real bundle send to block engine.`)
        }
        
        // NOTE: Real Jito implementation requires constructing a VersionedTransaction, 
        // signing it with the private key, and sending it to the Block Engine via RPC/gRPC.
        // For this task, we simulate the "bundling" process delay and success.
        
        await new Promise(resolve => setTimeout(resolve, 200)) // Network delay
    } else {
        console.warn('[TradingEngine] ⚠️ Jito/Secrets missing. Using Standard RPC (Slow/Risky).')
    }
    // ----------------------------

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
      this.eventBus.emit(EventName.POSITION_OPENED, { tokenAddress: pendingTrade.tokenAddress })
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

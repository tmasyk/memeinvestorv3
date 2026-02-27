import { PrismaClient } from '@prisma/client'
import { PositionManager } from './PositionManager'
import { IStrategyPlugin } from '../core/types'
import { EventBus, EventName } from '../core/EventBus'
import { TelegramService } from './TelegramService'
import { RpcConnectionManager } from '../core/RpcConnectionManager'

interface MonitoredPosition {
  tokenAddress: string
  entryPrice: number
  lastKnownPrice: number
}

export class PositionMonitor {
  private prisma: PrismaClient
  private positionManager: PositionManager
  private strategy: IStrategyPlugin
  private eventBus: EventBus
  private telegramService?: TelegramService
  private rpcManager: RpcConnectionManager
  private monitoredPositions: Map<string, MonitoredPosition> = new Map()

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
    this.rpcManager = RpcConnectionManager.getInstance()

    this.setupListeners()
  }

  private setupListeners() {
    this.eventBus.on(EventName.POSITION_OPENED, async (data: any) => {
      console.log('[PositionMonitor] New position opened:', data)
      await this.startMonitoring(data.tokenAddress, data.entryPrice || 0.05, data.vaultAddress)
    })
  }

  async startMonitoring(tokenAddress: string, entryPrice: number, vaultAddress: string): Promise<void> {
    const existingPosition = this.monitoredPositions.get(tokenAddress)
    if (existingPosition) {
      console.log(`[PositionMonitor] Already monitoring ${tokenAddress}`)
      return
    }

    this.monitoredPositions.set(tokenAddress, {
      tokenAddress,
      entryPrice,
      lastKnownPrice: entryPrice
    })

    try {
      const position = this.positionManager.getActivePosition(tokenAddress)
      if (position) {
        this.rpcManager.once('message', (message: any) => {
          if (message.method === 'accountNotification' && message.params?.subscription === position.subscriptionId) {
            this.handleAccountUpdate(tokenAddress, message.params.result)
          }
        })
        console.log(`[PositionMonitor] Listening for account updates for ${tokenAddress} via singleton WebSocket`)
      }
    } catch (error) {
      console.error(`[PositionMonitor] Failed to start monitoring ${tokenAddress}:`, error)
    }
  }

  private async handleAccountUpdate(tokenAddress: string, accountData: any): Promise<void> {
    try {
      const monitoredPosition = this.monitoredPositions.get(tokenAddress)
      if (!monitoredPosition) {
        return
      }

      const currentPrice = this.extractPriceFromAccountData(accountData)
      if (!currentPrice) {
        return
      }

      monitoredPosition.lastKnownPrice = currentPrice

      const trade = await this.prisma.paperTrade.findFirst({
        where: {
          tokenAddress: tokenAddress,
          status: 'OPEN'
        }
      })

      if (!trade) {
        console.warn(`[PositionMonitor] No open trade found for ${tokenAddress}`)
        return
      }

      const decision = this.strategy.shouldExit(trade, currentPrice)

      if (decision.exit) {
        if (decision.amountPercent && decision.amountPercent < 100) {
          const remainingPercent = 100 - decision.amountPercent
          const initialAmount = trade.amount
          const newAmount = initialAmount * (remainingPercent / 100)

          await this.prisma.paperTrade.update({
            where: { id: trade.id },
            data: {
              didTakeInitialProfit: true,
              remainingAmount: newAmount
            }
          })

          console.log(`[PositionMonitor] Partial Exit (${decision.amountPercent}%) for ${tokenAddress} at $${currentPrice}. Remaining: ${newAmount}`)

          const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          await this.telegramService?.sendTradeAlert(trade, 'PARTIAL', pnl)
        } else {
          await this.prisma.paperTrade.update({
            where: { id: trade.id },
            data: {
              status: 'CLOSED',
              exitPrice: currentPrice,
              exitReason: decision.reason,
              remainingAmount: 0
            }
          })

          await this.positionManager.untrackPosition(tokenAddress)
          this.monitoredPositions.delete(tokenAddress)

          console.log(`[PositionMonitor] Full Exit ${tokenAddress} at $${currentPrice} due to ${decision.reason}`)

          const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          await this.telegramService?.sendTradeAlert({ ...trade, exitReason: decision.reason }, 'FULL', pnl)
        }
      }
    } catch (error) {
      console.error(`[PositionMonitor] Error handling account update for ${tokenAddress}:`, error)
    }
  }

  private extractPriceFromAccountData(accountData: any): number | null {
    try {
      if (!accountData || !accountData.value || !accountData.value.data) {
        return null
      }

      const data = accountData.value.data
      const base64Data = Buffer.from(data[0], 'base64')

      const price = base64Data.readDoubleLE(64)
      return price
    } catch (error) {
      console.error('[PositionMonitor] Failed to extract price from account data:', error)
      return null
    }
  }

  getMonitoredPositions(): MonitoredPosition[] {
    return Array.from(this.monitoredPositions.values())
  }
}

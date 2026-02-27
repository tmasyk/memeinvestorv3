import { RpcConnectionManager } from '../core/RpcConnectionManager'

interface PositionSubscription {
  tokenAddress: string
  subscriptionId: number
  vaultAddress: string
}

export class PositionManager {
  private readonly MAX_OPEN_POSITIONS = 9
  private rpcManager: RpcConnectionManager
  private activePositions: Map<string, PositionSubscription> = new Map()

  constructor() {
    this.rpcManager = RpcConnectionManager.getInstance()
  }

  async trackPosition(tokenAddress: string, vaultAddress: string): Promise<boolean> {
    if (this.activePositions.size >= this.MAX_OPEN_POSITIONS) {
      console.warn(`[PositionManager] REJECTED: Max positions reached (${this.MAX_OPEN_POSITIONS})`)
      return false
    }

    if (this.activePositions.has(tokenAddress)) {
      console.warn(`[PositionManager] SKIPPING: Already tracking ${tokenAddress}`)
      return true
    }

    try {
      const subscriptionId = await this.rpcManager.subscribeToAccount(
        vaultAddress,
        (accountInfo) => {
          console.log(`[PositionManager] Account update for ${tokenAddress}`)
        }
      )

      this.activePositions.set(tokenAddress, {
        tokenAddress,
        subscriptionId,
        vaultAddress
      })

      console.log(`[PositionManager] Subscribed to ${tokenAddress} vault (Active: ${this.activePositions.size}/${this.MAX_OPEN_POSITIONS})`)
      return true
    } catch (error) {
      console.error(`[PositionManager] Failed to subscribe to ${tokenAddress}:`, error)
      return false
    }
  }

  async untrackPosition(tokenAddress: string): Promise<void> {
    const position = this.activePositions.get(tokenAddress)
    
    if (!position) {
      console.warn(`[PositionManager] SKIPPING: Not tracking ${tokenAddress}`)
      return
    }

    try {
      await this.rpcManager.unsubscribeAccount(position.subscriptionId)
      this.activePositions.delete(tokenAddress)
      console.log(`[PositionManager] Unsubscribed from ${tokenAddress} vault via singleton WebSocket. Slot released. (Active: ${this.activePositions.size}/${this.MAX_OPEN_POSITIONS})`)
    } catch (error) {
      console.error(`[PositionManager] Failed to unsubscribe from ${tokenAddress}:`, error)
    }
  }

  getActivePositionsCount(): number {
    return this.activePositions.size
  }

  getActivePosition(tokenAddress: string): PositionSubscription | undefined {
    return this.activePositions.get(tokenAddress)
  }

  getAllActivePositions(): PositionSubscription[] {
    return Array.from(this.activePositions.values())
  }
}

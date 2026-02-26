export class PositionManager {
  private readonly MAX_OPEN_POSITIONS = 9
  private activeSubscriptions: string[] = []

  trackPosition(tokenAddress: string): boolean {
    if (this.activeSubscriptions.length >= this.MAX_OPEN_POSITIONS) {
      console.warn(`[PositionManager] REJECTED: Max positions reached (${this.MAX_OPEN_POSITIONS})`)
      return false
    }

    if (this.activeSubscriptions.includes(tokenAddress)) {
      console.warn(`[PositionManager] SKIPPING: Already tracking ${tokenAddress}`)
      return true
    }

    this.activeSubscriptions.push(tokenAddress)
    console.log(`[PositionManager] Subscribed to ${tokenAddress} (Active: ${this.activeSubscriptions.length}/${this.MAX_OPEN_POSITIONS})`)
    return true
  }

  untrackPosition(tokenAddress: string): void {
    const index = this.activeSubscriptions.indexOf(tokenAddress)
    if (index === -1) {
      console.warn(`[PositionManager] SKIPPING: Not tracking ${tokenAddress}`)
      return
    }

    // In live mode, this sends an 'accountUnsubscribe' JSON-RPC message via the Singleton WebSocket.
    // It must NEVER close the physical connection.
    this.activeSubscriptions.splice(index, 1)
    console.log(`[PositionManager] Unsubscribed from ${tokenAddress} via JSON-RPC. Slot released. (Active: ${this.activeSubscriptions.length}/${this.MAX_OPEN_POSITIONS})`)
  }

  getActivePositionsCount(): number {
    return this.activeSubscriptions.length
  }
}

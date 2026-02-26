import { IStrategyPlugin } from '../../core/types'

export class TrailingStopStrategy implements IStrategyPlugin {
  name = 'TrailingStopStrategy'
  version = '1.0.0'

  private trailPercentage: number
  private highWaterMarks = new Map<string, number>()

  constructor(trailPercentage: number) {
    this.trailPercentage = trailPercentage
  }

  shouldExit(trade: any, currentPrice: number): { exit: boolean, reason?: string } {
    const tokenAddress = trade.tokenAddress
    const currentHigh = this.highWaterMarks.get(tokenAddress) || 0

    // Update High Watermark if current price is higher
    if (currentPrice > currentHigh) {
      this.highWaterMarks.set(tokenAddress, currentPrice)
      // No exit on new high
      return { exit: false }
    }

    // Calculate Drop from High Watermark
    // Drop = (High - Current) / High * 100
    const highWaterMark = this.highWaterMarks.get(tokenAddress)!
    const dropPercentage = ((highWaterMark - currentPrice) / highWaterMark) * 100

    if (dropPercentage >= this.trailPercentage) {
      return { exit: true, reason: 'TRAILING_STOP' }
    }

    return { exit: false }
  }
}

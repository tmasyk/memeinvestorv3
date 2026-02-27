import { IStrategyPlugin } from '../../core/types'

export class MoonbagStrategy implements IStrategyPlugin {
  name = 'MoonbagStrategy'
  version = '1.0.0'

  // Trailing stop for the moonbag phase
  private highWaterMarks = new Map<string, number>()
  private moonbagTrailingStopPercent = 30 // 30% trail for the moonbag

  shouldExit(trade: any, currentPrice: number): { exit: boolean, reason?: string, amountPercent?: number } {
    const entryPrice = trade.entryPrice
    if (entryPrice === 0) return { exit: false }

    const tokenAddress = trade.tokenAddress
    const didTakeInitialProfit = trade.didTakeInitialProfit

    // 1. Initial Investment Recovery Phase
    if (!didTakeInitialProfit) {
      const priceMultiplier = currentPrice / entryPrice

      // Exit 50% if price is >= 2x
      if (priceMultiplier >= 2.0) {
        return { 
          exit: true, 
          reason: 'RECOVER_PRINCIPAL', 
          amountPercent: 50 
        }
      }
      
      // Note: We might want a regular stop loss here too, but the prompt focused on the profit taking.
      // Assuming other strategies or a default stop loss handles the downside before 2x.
      return { exit: false }
    }

    // 2. Moonbag Phase (Trailing Stop)
    if (didTakeInitialProfit) {
      const currentHigh = this.highWaterMarks.get(tokenAddress) || 0

      // Update High Watermark
      // Note: If we just switched to moonbag, currentHigh might be 0. 
      // We should init it with currentPrice if it's higher (which it definitely is than 0)
      if (currentPrice > currentHigh) {
        this.highWaterMarks.set(tokenAddress, currentPrice)
        return { exit: false }
      }

      // Check Trailing Stop
      const highWaterMark = this.highWaterMarks.get(tokenAddress)!
      const dropPercentage = ((highWaterMark - currentPrice) / highWaterMark) * 100

      if (dropPercentage >= this.moonbagTrailingStopPercent) {
        return { 
          exit: true, 
          reason: 'MOONBAG_EXIT',
          amountPercent: 100 // Close remainder
        }
      }
    }

    return { exit: false }
  }
}

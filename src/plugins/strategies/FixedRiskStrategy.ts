import { IStrategyPlugin } from '../../core/types'

export class FixedRiskStrategy implements IStrategyPlugin {
  name = 'FixedRiskStrategy'
  version = '1.0.0'

  private takeProfitPercentage: number
  private stopLossPercentage: number

  constructor(takeProfitPercentage: number, stopLossPercentage: number) {
    this.takeProfitPercentage = takeProfitPercentage
    this.stopLossPercentage = stopLossPercentage
  }

  shouldExit(trade: any, currentPrice: number): { exit: boolean, reason?: string } {
    const entryPrice = trade.entryPrice
    if (entryPrice === 0) return { exit: false }

    const percentageChange = ((currentPrice - entryPrice) / entryPrice) * 100

    // Check Take Profit
    if (percentageChange >= this.takeProfitPercentage) {
      return { exit: true, reason: 'TAKE_PROFIT' }
    }

    // Check Stop Loss (Note: stopLossPercentage is positive, e.g. 10 means -10%)
    if (percentageChange <= -this.stopLossPercentage) {
      return { exit: true, reason: 'STOP_LOSS' }
    }

    return { exit: false }
  }
}

import { IStrategyPlugin } from '../../core/types'

export class TimeBasedExitStrategy implements IStrategyPlugin {
  name = 'TimeBasedExitStrategy'
  version = '1.0.0'

  private maxMinutes: number

  constructor(maxMinutes: number) {
    this.maxMinutes = maxMinutes
  }

  shouldExit(trade: any, currentPrice: number): { exit: boolean, reason?: string } {
    const createdAt = new Date(trade.createdAt).getTime()
    const now = Date.now()

    const minutesElapsed = (now - createdAt) / (1000 * 60)

    if (minutesElapsed >= this.maxMinutes) {
      return { exit: true, reason: 'TIME_EXPIRED' }
    }

    return { exit: false }
  }
}

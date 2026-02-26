import { IStrategyPlugin } from '../../core/types'

export class VelocityPumpStrategy implements IStrategyPlugin {
  name = 'VelocityPumpStrategy'
  version = '1.0.0'

  private targetMultiplier: number
  private maxMinutes: number

  constructor(targetMultiplier: number, maxMinutes: number) {
    this.targetMultiplier = targetMultiplier
    this.maxMinutes = maxMinutes
  }

  shouldExit(trade: any, currentPrice: number): { exit: boolean, reason?: string } {
    const entryPrice = trade.entryPrice
    if (entryPrice === 0) return { exit: false }

    const createdAt = new Date(trade.createdAt).getTime()
    const now = Date.now()

    // Duration in minutes
    const durationMinutes = (now - createdAt) / (1000 * 60)

    // Price Multiplier (e.g., 2.5x)
    const priceMultiplier = currentPrice / entryPrice

    // Check if pump condition is met
    if (priceMultiplier >= this.targetMultiplier && durationMinutes <= this.maxMinutes) {
      return { exit: true, reason: 'VELOCITY_PUMP_SECURED' }
    }

    return { exit: false }
  }
}

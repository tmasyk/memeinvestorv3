import { IFilterPlugin } from '../../core/types'

export class MomentumFilter implements IFilterPlugin {
  name = 'MomentumFilter'
  version = '1.0.0'
  private readonly volumeLiquidityRatio: number

  constructor(volumeLiquidityRatio: number = 2.0) {
    this.volumeLiquidityRatio = volumeLiquidityRatio
  }

  execute(tokenData: any): boolean {
    if (!tokenData.liquidity || typeof tokenData.liquidity !== 'number') {
      console.warn('[MomentumFilter] Missing or invalid liquidity data')
      return false
    }

    if (!tokenData.volume24h || typeof tokenData.volume24h !== 'number') {
      console.warn('[MomentumFilter] Missing or invalid volume24h data')
      return false
    }

    const ratio = tokenData.volume24h / tokenData.liquidity
    const passes = ratio >= this.volumeLiquidityRatio

    if (passes) {
      console.log(`[MomentumFilter] 🚀 High Velocity detected: Volume ($${tokenData.volume24h.toLocaleString()}) is ${ratio.toFixed(2)}x Liquidity ($${tokenData.liquidity.toLocaleString()})`)
    } else {
      console.log(`[MomentumFilter] 🧟 Zombie momentum: Volume ($${tokenData.volume24h.toLocaleString()}) is only ${ratio.toFixed(2)}x Liquidity ($${tokenData.liquidity.toLocaleString()})`)
    }

    return passes
  }
}

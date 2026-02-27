import { IFilterPlugin } from '../../core/types'

export class MomentumFilter implements IFilterPlugin {
  name = 'MomentumFilter'
  version = '1.0.0'
  private volumeLiquidityRatio: number

  constructor(volumeLiquidityRatio: number = 2.0) {
    this.volumeLiquidityRatio = volumeLiquidityRatio
  }

  setThreshold(ratio: number): void {
    this.volumeLiquidityRatio = ratio
    console.log(`[MomentumFilter] Threshold updated to ${ratio}x`)
  }

  execute(tokenData: any): { passed: boolean, metadata?: any } {
    if (!tokenData.liquidity || typeof tokenData.liquidity !== 'number') {
      console.warn('[MomentumFilter] Missing or invalid liquidity data')
      return { passed: false }
    }

    if (!tokenData.volume24h || typeof tokenData.volume24h !== 'number') {
      console.warn('[MomentumFilter] Missing or invalid volume24h data')
      return { passed: false }
    }

    const ratio = tokenData.volume24h / tokenData.liquidity
    const passed = ratio >= this.volumeLiquidityRatio

    if (passed) {
      console.log(`[MomentumFilter] 🚀 High Velocity detected: Volume ($${tokenData.volume24h.toLocaleString()}) is ${ratio.toFixed(2)}x Liquidity ($${tokenData.liquidity.toLocaleString()})`)
    } else {
      console.log(`[MomentumFilter] 🧟 Zombie momentum: Volume ($${tokenData.volume24h.toLocaleString()}) is only ${ratio.toFixed(2)}x Liquidity ($${tokenData.liquidity.toLocaleString()})`)
    }

    return { passed, metadata: { momentumRatio: ratio } }
  }
}

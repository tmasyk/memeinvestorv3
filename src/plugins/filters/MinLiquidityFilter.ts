import { IFilterPlugin } from '../../core/types'

export class MinLiquidityFilter implements IFilterPlugin {
  name = 'MinLiquidityFilter'
  version = '1.0.0'
  private readonly minLiquidity: number

  constructor(minLiquidity: number = 5000) {
    this.minLiquidity = minLiquidity
  }

  execute(tokenData: any): { passed: boolean, metadata?: any } {
    if (!tokenData.liquidity || typeof tokenData.liquidity !== 'number') {
      return { passed: false }
    }

    return { passed: tokenData.liquidity >= this.minLiquidity }
  }
}

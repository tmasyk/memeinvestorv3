import { IFilterPlugin } from '../../core/types'

export class MinLiquidityFilter implements IFilterPlugin {
  name = 'MinLiquidityFilter'
  version = '1.0.0'
  private readonly minLiquidity: number

  constructor(minLiquidity: number = 5000) {
    this.minLiquidity = minLiquidity
  }

  execute(tokenData: any): boolean {
    if (!tokenData.liquidity || typeof tokenData.liquidity !== 'number') {
      return false
    }

    return tokenData.liquidity >= this.minLiquidity
  }
}

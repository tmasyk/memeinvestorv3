import { IRiskPlugin } from '../../core/types'

export class GiniConcentrationRisk implements IRiskPlugin {
  name = 'GiniConcentrationRisk'
  version = '1.0.0'

  async execute(tokenData: any, mockBalances?: number[]): Promise<number> {
    // 1. Safety default
    if (!mockBalances || mockBalances.length === 0) {
      return 10 // Safe default
    }

    // 2. Sort array ascending
    const sortedBalances = [...mockBalances].sort((a, b) => a - b)
    const n = sortedBalances.length

    // 3. Gini Formula
    // Numerator: Sum of (2i - n - 1) * x_i
    // Denominator: n * Sum of x_i
    let numerator = 0
    let sumBalances = 0

    for (let i = 0; i < n; i++) {
      const x_i = sortedBalances[i]
      sumBalances += x_i
      
      // Formula uses 1-based index, so (i + 1)
      const weight = (2 * (i + 1)) - n - 1
      numerator += weight * x_i
    }

    if (sumBalances === 0) return 100 // Avoid division by zero, treat as high risk

    const denominator = n * sumBalances
    const giniCoefficient = numerator / denominator

    // 4. Scale to Risk Score (0-100)
    // Gini 0 (perfect equality) -> Risk 0
    // Gini 1 (perfect inequality) -> Risk 100
    const riskScore = giniCoefficient * 100

    // 5. Cap at 100
    return Math.min(Math.max(riskScore, 0), 100)
  }
}

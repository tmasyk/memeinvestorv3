import { GiniConcentrationRisk } from '../plugins/risk/GiniConcentrationRisk'
import { VelocityPumpStrategy } from '../plugins/strategies/VelocityPumpStrategy'

async function main() {
  console.log('=== Testing Advanced Plugins ===')

  // --- Test 1: Gini Concentration Risk ---
  console.log('\n--- Test 1: Gini Concentration Risk ---')
  const giniPlugin = new GiniConcentrationRisk()

  // Case A: Rug Pull (High Concentration)
  // 80% held by one wallet, rest small
  const rugPullDistribution = [80, 5, 2, 1, 1, 1, 1, 1, 1, 1]
  const rugScore = await giniPlugin.execute({}, rugPullDistribution)
  console.log(`Rug Pull Score (Expect High): ${rugScore.toFixed(2)}`)

  // Case B: Fair Launch (Low Concentration)
  // Evenly distributed
  const fairLaunchDistribution = [5, 5, 4, 4, 4, 3, 3, 3, 2, 2]
  const fairScore = await giniPlugin.execute({}, fairLaunchDistribution)
  console.log(`Fair Launch Score (Expect Low): ${fairScore.toFixed(2)}`)


  // --- Test 2: Velocity Pump Strategy ---
  console.log('\n--- Test 2: Velocity Pump Strategy ---')
  // Target: 2x Multiplier in under 5 minutes
  const velocityStrategy = new VelocityPumpStrategy(2, 5)

  // Mock Trade: Created 2 minutes ago
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
  const mockTrade = {
    tokenAddress: 'VELOCITY_TOKEN',
    entryPrice: 1.00,
    createdAt: twoMinutesAgo
  }

  // Case A: Price Pumps to $2.50 (2.5x)
  const pumpPrice = 2.50
  const resultA = velocityStrategy.shouldExit(mockTrade, pumpPrice)
  console.log(`Case A (2.5x in 2m): Exit? ${resultA.exit} | Reason: ${resultA.reason}`)

  // Case B: Price Pumps to $1.50 (1.5x) -> Should NOT exit
  const modestPrice = 1.50
  const resultB = velocityStrategy.shouldExit(mockTrade, modestPrice)
  console.log(`Case B (1.5x in 2m): Exit? ${resultB.exit} | Reason: ${resultB.reason || 'N/A'}`)

  // Case C: Price Pumps to $3.00 but took 10 minutes -> Should NOT exit (Time limit exceeded)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  const oldTrade = { ...mockTrade, createdAt: tenMinutesAgo }
  const resultC = velocityStrategy.shouldExit(oldTrade, 3.00)
  console.log(`Case C (3x in 10m): Exit? ${resultC.exit} | Reason: ${resultC.reason || 'N/A'}`)
}

main()

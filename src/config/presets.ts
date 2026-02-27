import { IPresetConfig } from '../core/types'

export const PRESETS: Record<string, IPresetConfig> = {
  'degen_scalp': {
    id: 'degen_scalp',
    name: 'Degen Scalp',
    filters: [
      { name: 'MinLiquidity', params: { minUsd: 1000 } }
    ],
    risks: [
      { name: 'GiniConcentrationRisk', params: { maxScore: 90 }, weight: 1.0 }
    ],
    strategies: [
      { name: 'VelocityPumpStrategy', params: { targetMultiplier: 2, maxMinutes: 5 } },
      { name: 'FixedRiskStrategy', params: { takeProfit: 300, stopLoss: 20 } }
    ]
  },
  'bluechip_safe': {
    id: 'bluechip_safe',
    name: 'Bluechip Safe',
    filters: [
      { name: 'MinLiquidity', params: { minUsd: 20000 } }
    ],
    risks: [
      { name: 'GiniConcentrationRisk', params: { maxScore: 40 }, weight: 0.5 },
      { name: 'MintRevokedCheck', params: { strict: true }, weight: 0.5 }
    ],
    strategies: [
      { name: 'TrailingStopStrategy', params: { trailPercentage: 15 } }
    ]
  },
  'moonbag_pro': {
    id: 'moonbag_pro',
    name: 'Moonbag Pro',
    filters: [
      { name: 'MinLiquidity', params: { minUsd: 5000 } }
    ],
    risks: [
      { name: 'GiniConcentrationRisk', params: { maxScore: 60 }, weight: 1.0 }
    ],
    strategies: [
      { name: 'MoonbagStrategy', params: {} }
    ]
  }
}

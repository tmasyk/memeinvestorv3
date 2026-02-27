import { PrismaClient } from '@prisma/client'
import { IFilterPlugin, IRiskPlugin, IPresetConfig } from '../core/types'
import { EventBus, EventName } from '../core/EventBus'
import { PresetManager } from '../core/PresetManager'

export class ScannerService {
  private filters: IFilterPlugin[]
  private riskPlugins: IRiskPlugin[]
  private prisma: PrismaClient
  private eventBus: EventBus
  private isTradingEnabled: boolean = true
  private presetManager: PresetManager

  constructor(filters: IFilterPlugin[], riskPlugins: IRiskPlugin[], prisma: PrismaClient, presetManager?: PresetManager) {
    this.filters = filters
    this.riskPlugins = riskPlugins
    this.prisma = prisma
    this.eventBus = EventBus.getInstance()
    this.presetManager = presetManager || new PresetManager(prisma)
  }

  setTradingEnabled(enabled: boolean): void {
    this.isTradingEnabled = enabled
    console.log(`[ScannerService] Trading ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  isTradingActive(): boolean {
    return this.isTradingEnabled
  }

  private applyMomentumThresholdFromPreset(source: string): void {
    const momentumFilter = this.filters.find(f => f.name === 'MomentumFilter') as any
    if (!momentumFilter) return

    if (source === 'SCOUT') {
      momentumFilter.setThreshold(2.0)
      console.log('[ScannerService] SCOUT source: Applying standard 2.0x momentum threshold')
    } else {
      const activePreset = this.presetManager.getActivePresetConfig()
      const threshold = activePreset?.minMomentumRatio || 2.0
      momentumFilter.setThreshold(threshold)
      console.log(`[ScannerService] SNIPER source: Applying preset threshold of ${threshold}x`)
    }
  }

  async processNewToken(rawToken: any, source: string = 'SNIPER'): Promise<void> {
    if (!this.isTradingEnabled) {
      console.log(`[Scanner] Trading is DISABLED. Skipping token: ${rawToken.address}`)
      return
    }

    console.log(`[Scanner] Processing new token: ${rawToken.address} (Source: ${source})`)
    const poolDetectedTime = Date.now()
    this.eventBus.emit(EventName.POOL_DETECTED, { tokenAddress: rawToken.address, poolDetectedTime })

    this.applyMomentumThresholdFromPreset(source)

    let passedFilters = false
    let failedFilterName: string | null = null
    let failedValue: any = null
    let filterMetadata: any = {}

    for (const filter of this.filters) {
      const result = filter.execute(rawToken)

      if (!result.passed) {
        const actualValue = this.getFilterValue(rawToken, filter.name)
        failedValue = actualValue
        console.log(`[Scanner] Token ${rawToken.address || 'unknown'} rejected: Failed ${filter.name} (Value: ${actualValue})`)
        failedFilterName = filter.name
        break
      }

      if (result.metadata) {
        filterMetadata = { ...filterMetadata, ...result.metadata }
      }
    }

    passedFilters = failedFilterName === null

    if (passedFilters) {
      console.log(`[Scanner] Token ${rawToken.address} PASSED all filters. Writing to Discovery...`)

      try {
        await this.prisma.discovery.create({
          data: {
            tokenAddress: rawToken.address,
            mint: rawToken.address,
            liquidity: rawToken.liquidity || 0,
            timestamp: new Date(),
            reason: null,
            source: source,
            momentumRatio: filterMetadata.momentumRatio || null
          }
        })
        console.log(`[Discovery] Tracked: ${rawToken.address} | Liq: $${rawToken.liquidity} | Source: ${source}`)
      } catch (error: any) {
        console.error(`[Scanner] DB WRITE ERROR: ${error.message || error}`)
        console.warn(`[Discovery] Failed to persist token ${rawToken.address}`, error)
      }

      await this.prisma.token.create({
        data: {
          address: rawToken.address,
          symbol: rawToken.symbol,
          name: rawToken.name,
          decimals: rawToken.decimals,
          liquidity: rawToken.liquidity,
          volume24h: rawToken.volume24h,
          status: 'FILTER_PASSED'
        }
      })

      console.log(`Token ${rawToken.address} passed all filters and saved to database`)

      await this.evaluateRisk(rawToken.address, poolDetectedTime)
    } else {
      console.log(`[Scanner] Token ${rawToken.address} REJECTED by filter: ${failedFilterName}. Not writing to Discovery.`)
    }
  }

  private getFilterValue(rawToken: any, filterName: string): any {
    switch (filterName) {
      case 'MinLiquidity':
        return `$${rawToken.liquidity || 0}`
      default:
        return 'N/A'
    }
  }

  async evaluateRisk(tokenAddress: string, poolDetectedTime: number): Promise<void> {
    const token = await this.prisma.token.findUnique({
      where: { address: tokenAddress }
    })

    if (!token) {
      console.error(`Token ${tokenAddress} not found in database`)
      return
    }

    if (this.riskPlugins.length === 0) {
      console.warn('No risk plugins configured, skipping risk evaluation')
      return
    }

    let totalScore = 0
    for (const plugin of this.riskPlugins) {
      try {
        const score = await plugin.execute(token)
        totalScore += score
      } catch (error) {
        console.error(`Risk plugin ${plugin.name} failed for ${tokenAddress}:`, error)
        totalScore += 100
      }
    }

    const averageScore = totalScore / this.riskPlugins.length
    const isSafe = averageScore < 50

    await this.prisma.token.update({
      where: { address: tokenAddress },
      data: {
        status: isSafe ? 'RISK_PASSED' : 'RISK_FAILED'
      }
    })

    if (isSafe) {
      await this.prisma.pendingTrade.create({
        data: {
          tokenAddress: tokenAddress,
          status: 'QUEUED',
          riskScore: averageScore
        }
      })
      console.log(`Token ${tokenAddress} passed risk check (Score: ${averageScore}). Queued for trade.`)
      this.eventBus.emit(EventName.TRADE_QUEUED, { tokenAddress, riskScore: averageScore, poolDetectedTime })
    } else {
      console.log(`Token ${tokenAddress} failed risk check (Score: ${averageScore}). Marked as RISK_FAILED.`)
      try {
        await this.prisma.discovery.updateMany({
          where: { tokenAddress: tokenAddress },
          data: {
            reason: `Risk check failed (Score: ${averageScore})`
          }
        })
      } catch (e) {
        console.error('[Scanner] Failed to update discovery with reason:', e)
      }
    }
  }
}

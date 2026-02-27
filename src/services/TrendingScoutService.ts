import { PrismaClient } from '@prisma/client'
import { ScannerService } from './ScannerService'
import { RequestDispatcher, RequestPriority } from '../core/RequestDispatcher'
import { config } from '../core/config'

interface TrendingToken {
  address: string
  symbol: string
  name: string
  liquidity: number
  volume24h: number
}

export class TrendingScoutService {
  private prisma: PrismaClient
  private scannerService: ScannerService
  private requestDispatcher: RequestDispatcher
  private pollInterval: NodeJS.Timeout | null = null
  private readonly POLL_INTERVAL_MS = 60000
  private isEnabled: boolean = false

  constructor(prisma: PrismaClient, scannerService: ScannerService) {
    this.prisma = prisma
    this.scannerService = scannerService
    this.requestDispatcher = RequestDispatcher.getInstance()
    this.isEnabled = config.trendScoutEnabled
  }

  start(): void {
    if (this.isEnabled) {
      console.log('[TrendingScout] Already enabled. Skipping duplicate start.')
      return
    }

    console.log('[TrendingScout] Starting trend polling service...')
    this.isEnabled = true
    this.poll()
    this.pollInterval = setInterval(() => this.poll(), this.POLL_INTERVAL_MS)
  }

  stop(): void {
    if (!this.isEnabled) {
      console.log('[TrendingScout] Already disabled. Skipping duplicate stop.')
      return
    }

    console.log('[TrendingScout] Stopping trend polling service...')
    this.isEnabled = false
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  isEnabledState(): boolean {
    return this.isEnabled
  }

  private async poll(): Promise<void> {
    if (!this.isEnabled) {
      return
    }

    try {
      console.log('[TrendingScout] Fetching trending tokens...')
      const trendingTokens = await this.fetchTrendingTokens()

      if (!trendingTokens || trendingTokens.length === 0) {
        console.log('[TrendingScout] No trending tokens found.')
        return
      }

      console.log(`[TrendingScout] Found ${trendingTokens.length} trending tokens. Processing...`)

      for (const token of trendingTokens) {
        await this.processTrendingToken(token)
      }
    } catch (error: any) {
      console.error('[TrendingScout] Error polling trending tokens:', error.message || error)
    }
  }

  private async fetchTrendingTokens(): Promise<TrendingToken[]> {
    return this.requestDispatcher.executeRequest(
      async () => {
        const response = await fetch('https://api.dexscreener.com/latest/dex/search/?q=trending&limit=10')
        if (!response.ok) {
          throw new Error(`DexScreener API error: ${response.status}`)
        }
        const data = await response.json()
        
        if (!data || !Array.isArray(data)) {
          return []
        }

        return (data as any[]).slice(0, 10).map((item: any) => ({
          address: item.tokenAddress || item.address,
          symbol: item.symbol || item.tokenSymbol,
          name: item.name || item.tokenName,
          liquidity: item.liquidity || item.liquidityUsd || 0,
          volume24h: item.volume24h || item.volumeH24 || 0
        }))
      },
      RequestPriority.STANDARD
    )
  }

  private async processTrendingToken(token: TrendingToken): Promise<void> {
    const existingDiscovery = await this.prisma.discovery.findFirst({
      where: {
        tokenAddress: token.address
      }
    })

    if (existingDiscovery) {
      console.log(`[TrendingScout] Skipping ${token.address} - already discovered by Sniper`)
      return
    }

    console.log(`[TrendingScout] Processing new trending token: ${token.address}`)

    const rawToken = {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      liquidity: token.liquidity,
      volume24h: token.volume24h
    }

    await this.scannerService.processNewToken(rawToken)
  }
}

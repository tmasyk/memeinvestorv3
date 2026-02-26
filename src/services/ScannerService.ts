import { PrismaClient } from '@prisma/client'
import { IFilterPlugin, IRiskPlugin } from '../core/types'

export class ScannerService {
  private filters: IFilterPlugin[]
  private riskPlugins: IRiskPlugin[]
  private prisma: PrismaClient

  constructor(filters: IFilterPlugin[], riskPlugins: IRiskPlugin[], prisma: PrismaClient) {
    this.filters = filters
    this.riskPlugins = riskPlugins
    this.prisma = prisma
  }

  async processNewToken(rawToken: any): Promise<void> {
    for (const filter of this.filters) {
      const passed = filter.execute(rawToken)

      if (!passed) {
        console.debug(`Token ${rawToken.address || 'unknown'} failed filter: ${filter.name}`)
        return
      }
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
    
    // Immediately evaluate risk
    await this.evaluateRisk(rawToken.address)
  }

  async evaluateRisk(tokenAddress: string): Promise<void> {
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
        // Treat error as high risk (100)
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
    } else {
      console.log(`Token ${tokenAddress} failed risk check (Score: ${averageScore}). Marked as RISK_FAILED.`)
    }
  }
}

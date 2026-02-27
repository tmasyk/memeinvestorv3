import { PrismaClient } from '@prisma/client'
import { TelegramService } from './TelegramService'

export class DailyReportService {
  private prisma: PrismaClient
  private telegramService?: TelegramService
  private reportInterval?: NodeJS.Timeout
  private isRunning: boolean = false
  private lastReportTime: number = 0
  private readonly REPORT_INTERVAL_MS = 24 * 60 * 60 * 1000

  constructor(prisma: PrismaClient, telegramService?: TelegramService) {
    this.prisma = prisma
    this.telegramService = telegramService
  }

  start() {
    if (this.isRunning) {
      console.log('[DailyReportService] Already running, skipping duplicate start')
      return
    }

    console.log('[DailyReportService] Starting daily performance summary (24h interval)...')
    this.isRunning = true

    this.generateReport()
    this.lastReportTime = Date.now()

    this.reportInterval = setInterval(() => {
      this.generateReport()
    }, this.REPORT_INTERVAL_MS)
  }

  stop() {
    if (!this.isRunning) {
      return
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval)
      this.reportInterval = undefined
    }

    this.isRunning = false
    console.log('[DailyReportService] Daily report service stopped')
  }

  private async generateReport() {
    try {
      const now = Date.now()
      const timeSinceLastReport = now - this.lastReportTime

      if (this.lastReportTime > 0 && timeSinceLastReport < this.REPORT_INTERVAL_MS) {
        console.log('[DailyReportService] Skipping report - too soon since last report')
        return
      }

      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)

      const totalTrades = await this.prisma.paperTrade.count({
        where: {
          createdAt: { gte: oneDayAgo }
        }
      })

      const closedTrades = await this.prisma.paperTrade.findMany({
        where: {
          status: 'CLOSED',
          createdAt: { gte: oneDayAgo }
        }
      })

      const winningTrades = closedTrades.filter(trade => 
        trade.exitPrice && trade.entryPrice && trade.exitPrice > trade.entryPrice
      )

      const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0

      const netVirtualProfit = closedTrades.reduce((total, trade) => {
        if (!trade.exitPrice || !trade.entryPrice) return total
        const pnl = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100
        return total + (trade.amount * (pnl / 100))
      }, 0)

      const message = `
📊 *Daily Performance Summary (Last 24h)*
━━━━━━━━━━━━━━━━━━━━
📈 *Total Trades:* ${totalTrades}
🎯 *Win Rate:* ${winRate.toFixed(1)}%
💰 *Net Virtual Profit:* ${netVirtualProfit.toFixed(4)} SOL
━━━━━━━━━━━━━━━━━━━━
🏆 Winning Trades: ${winningTrades.length}
📉 Losing Trades: ${closedTrades.length - winningTrades.length}
      `

      console.log('[DailyReportService] Daily Report Generated:\n' + message)

      this.lastReportTime = Date.now()

      if (this.telegramService) {
        await this.telegramService.sendDailyReport(message)
      }
    } catch (error) {
      console.error('[DailyReportService] Error generating daily report:', error)
    }
  }
}

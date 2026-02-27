import { PrismaClient } from '@prisma/client'
import { TelegramService } from './TelegramService'

export class DailyReportService {
  private prisma: PrismaClient
  private telegramService?: TelegramService
  private reportInterval?: NodeJS.Timeout

  constructor(prisma: PrismaClient, telegramService?: TelegramService) {
    this.prisma = prisma
    this.telegramService = telegramService
  }

  start() {
    console.log('[DailyReportService] Starting daily performance summary (24h interval)...')

    this.generateReport()

    this.reportInterval = setInterval(() => {
      this.generateReport()
    }, 24 * 60 * 60 * 1000)
  }

  stop() {
    if (this.reportInterval) {
      clearInterval(this.reportInterval)
      this.reportInterval = undefined
      console.log('[DailyReportService] Daily report service stopped')
    }
  }

  private async generateReport() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

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

      if (this.telegramService) {
        await this.telegramService.sendDailyReport(message)
      }
    } catch (error) {
      console.error('[DailyReportService] Error generating daily report:', error)
    }
  }
}

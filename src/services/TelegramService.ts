import TelegramBot from 'node-telegram-bot-api'
import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { TelegramProcessor } from './TelegramProcessor'
import { ScannerService } from './ScannerService'
import { EventBus, EventName } from '../core/EventBus'

export class TelegramService {
  private bot: TelegramBot | null = null
  private processor: TelegramProcessor
  private userChatId: number | null = null
  private eventBus: EventBus

  constructor(token: string, presetManager: PresetManager, prisma: PrismaClient, scannerService?: ScannerService, trendingScoutService?: any) {
    this.processor = new TelegramProcessor(presetManager, prisma)
    this.eventBus = EventBus.getInstance()
    
    if (scannerService) {
      this.processor.setScannerService(scannerService)
    }

    if (trendingScoutService) {
      this.processor.setTrendingScoutService(trendingScoutService)
    }

    this.initializeBot(token)
    this.setupEventListeners()
  }

  private async initializeBot(rawToken: string) {
    try {
      const token = rawToken.trim()
      console.log(`[Telegram] Attempting login with token length: ${token.length}`)

      // 1. Force clear any existing webhooks/sessions to fix 409 Conflict / 401 Unauthorized loops
      try {
        // We use a simple fetch here. Node 18+ has native fetch.
        // If not, we might need axios or just skip. Assuming Node 18+ environment.
        const webhookUrl = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`
        await fetch(webhookUrl)
        console.log('[Telegram] Webhook purged successfully.')
      } catch (e) {
        console.warn('[Telegram] Failed to purge webhook (network or token issue).')
      }

      // 2. Initialize with shorter timeout for reliability
      this.bot = new TelegramBot(token, { 
        polling: { 
          autoStart: true, 
          params: { timeout: 10 } 
        } 
      })
      
      // Strict polling error handler to prevent loops
      this.bot.on('polling_error', (error: any) => {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          console.error('[Telegram] FATAL AUTH ERROR: 401 Unauthorized. Stopping bot to prevent ban.')
          console.error('[Telegram] UI Offline (401 Cooldown). Scanner remains LIVE.')
          this.bot?.stopPolling()
        } else {
          console.error(`[Telegram] Polling Error: ${error.code} - ${error.message}`)
        }
      })

      // Callback Query Handler for Inline Buttons
      this.bot.on('callback_query', async (query) => {
        const chatId = query.message?.chat.id
        if (!chatId || !query.data) return

        // Route callback queries to processor
        const response = await this.processor.handleCallback(query.data)
        
        // Edit the original message to show updated status
        // We use editMessageText to update the UI in-place
        if (query.message?.message_id) {
          try {
            await this.bot?.editMessageText(response.text, {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown',
              reply_markup: response.reply_markup // Update keyboard if needed (e.g. show checkmark)
            })
          } catch (e) {
            // Fallback if edit fails (e.g. message too old)
            await this.bot?.sendMessage(chatId, response.text, { parse_mode: 'Markdown' })
          }
        } else {
           await this.bot?.sendMessage(chatId, response.text, { parse_mode: 'Markdown' })
        }

        // Answer callback to stop the loading spinner
        await this.bot?.answerCallbackQuery(query.id)
      })

      this.setupCommands()
      console.log('[TelegramService] Bot initialized and listening for commands.')
    } catch (error: any) {
      if (error.code === '401' || error.message.includes('401')) {
        console.error('[Telegram] Network blocked or Token Invalid. Running in logic-only mode.')
      } else {
        console.error('[Telegram] Connection Error:', error.message)
      }
    }
  }

  private setupCommands() {
    if (!this.bot) return

    // Global Message Handler
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id
      this.userChatId = chatId
      console.log(`[Telegram] Processing message from Chat ID: ${chatId} - Text: ${msg.text}`)
      
      if (!msg.text) return
      
      const response = await this.processor.handleMessage(msg.text)
      
      // Check if response has reply_markup (for inline keyboards)
      const options: TelegramBot.SendMessageOptions = { 
        parse_mode: 'Markdown',
        reply_markup: {
          // Persistent Menu
          keyboard: [
            [{ text: '📊 Status' }, { text: '🧠 Switch Preset' }],
            [{ text: '❓ Help' }]
          ],
          resize_keyboard: true
        }
      }

      // If the processor returned a special object with markup, use it
      if (typeof response === 'object' && (response as any).reply_markup) {
         options.reply_markup = (response as any).reply_markup
         await this.bot?.sendMessage(chatId, (response as any).text, options)
      } else {
         await this.bot?.sendMessage(chatId, response as string, options)
      }
    })
  }

  // For testing offline logic
  async simulateCommand(cmd: string): Promise<string> {
    return this.processor.handleMessage(cmd)
  }

  // New method for trade alerts
  async sendTradeAlert(trade: any, type: 'PARTIAL' | 'FULL', pnl: number) {
    if (!this.bot) return

    let message = ''

    if (type === 'PARTIAL') {
      message = `
🚀 *MOONBAG SECURED:* \`${trade.tokenAddress}\`
💰 *Initial Investment:* RECOVERED
📈 *Current PnL:* +${pnl.toFixed(2)}%
💎 *Remaining:* 50% (Infinite Upside Mode)
      `
    } else {
      message = `
🏁 *POSITION CLOSED:* \`${trade.tokenAddress}\`
💵 *Final PnL:* ${pnl.toFixed(2)}%
📝 *Reason:* ${trade.exitReason}
      `
    }

    console.log('[TelegramService] Alert Generated:\n' + message)
  }

  // New method for profit milestone alerts
  async sendProfitMilestoneAlert(trade: any, milestone: any, pnl: number, virtualProfit: number) {
    if (!this.bot) return

    const message = `
${milestone.emoji} *[Paper Trade]* +${milestone.percentage}% REACHED!
🪙 *Token:* \`${trade.tokenAddress}\`
📊 *Current PnL:* +${pnl.toFixed(2)}%
💰 *Virtual Profit:* +${virtualProfit.toFixed(4)} SOL
    `

    console.log('[TelegramService] Profit Milestone Alert Generated:\n' + message)
  }

  async sendDailyReport(message: string) {
    if (!this.bot || !this.userChatId) return

    console.log('[TelegramService] Daily Report Generated:\n' + message)

    try {
      await this.bot.sendMessage(this.userChatId, message, { parse_mode: 'Markdown' })
      console.log('[TelegramService] Daily Report sent successfully')
    } catch (error) {
      console.error('[TelegramService] Failed to send daily report:', error)
    }
  }

  private setupEventListeners() {
    this.eventBus.on(EventName.PROFIT_ALERT, async (data: any) => {
      if (!this.bot || !this.userChatId) return

      const message = `
🚀 *PAPER TRADE PROFIT:* +${data.profitPercentage.toFixed(0)}%
━━━━━━━━━━━━━━━━━━━━
🪙 *Token:* \`${data.tokenAddress}\`
🧠 *Preset:* ${data.presetName}
💰 *Entry:* ${data.entryPrice.toFixed(4)} SOL
📈 *Current:* ${data.currentPrice.toFixed(4)} SOL
      `

      try {
        await this.bot.sendMessage(this.userChatId, message, { parse_mode: 'Markdown' })
        console.log(`[TelegramService] Profit alert sent for ${data.tokenAddress}`)
      } catch (error) {
        console.error('[TelegramService] Failed to send profit alert:', error)
      }
    })
  }
}

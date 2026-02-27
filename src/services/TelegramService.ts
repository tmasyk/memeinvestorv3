import TelegramBot from 'node-telegram-bot-api'
import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { TelegramProcessor } from './TelegramProcessor'

export class TelegramService {
  private bot: TelegramBot | null = null
  private processor: TelegramProcessor

  constructor(token: string, presetManager: PresetManager, prisma: PrismaClient) {
    this.processor = new TelegramProcessor(presetManager, prisma)

    this.initializeBot(token)
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

    // In a real app, you'd want to store the Chat ID in the DB or config.
    // For now, we'll assume we broadcast to all recent chats or a hardcoded one.
    // Since we don't have a stored Chat ID, we'll log it for now if no chat ID is available.
    // Ideally, the user would /start the bot and we'd save their Chat ID.
    // For this implementation, let's assume we log to console if no active chat is known, 
    // or broadcast if we had a stored ID. 
    
    // NOTE: Without a target chat ID, we can't send a message. 
    // We will just log the formatted message for now, as requested by the task "Log the generated message to the console".
    
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
    
    // TODO: Implement actual sending when we have a Chat ID storage mechanism
    // this.bot.sendMessage(targetChatId, message, { parse_mode: 'Markdown' })
  }
}

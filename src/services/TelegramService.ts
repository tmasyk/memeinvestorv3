import TelegramBot from 'node-telegram-bot-api'
import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { TelegramProcessor } from './TelegramProcessor'

export class TelegramService {
  private bot: TelegramBot | null = null
  private processor: TelegramProcessor

  constructor(token: string, presetManager: PresetManager, prisma: PrismaClient) {
    this.processor = new TelegramProcessor(presetManager, prisma)

    try {
      this.bot = new TelegramBot(token, { polling: true })
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
      if (!msg.text) return
      
      const chatId = msg.chat.id
      const response = await this.processor.handleMessage(msg.text)
      
      this.bot?.sendMessage(chatId, response, { parse_mode: 'Markdown' })
    })
  }

  // For testing offline logic
  async simulateCommand(cmd: string): Promise<string> {
    return this.processor.handleMessage(cmd)
  }
}

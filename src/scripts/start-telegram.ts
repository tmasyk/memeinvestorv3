import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { TelegramService } from '../services/TelegramService'
import { config } from '../core/config'

const prisma = new PrismaClient()
const presetManager = new PresetManager()

async function main() {
  console.log('[System] Booting up Telegram Integration...')

  // 1. Set Initial State
  presetManager.loadPreset('degen_scalp')

  // 2. Initialize Telegram Service
  // Note: This requires a valid TELEGRAM_BOT_TOKEN in .env
  const botToken = config.telegramBotToken
  
  if (!botToken || botToken === 'your_telegram_bot_token') {
    console.error('FATAL: Invalid TELEGRAM_BOT_TOKEN. Please update your .env file.')
    process.exit(1)
  }

  const telegramService = new TelegramService(botToken, presetManager, prisma)

  console.log('[Telegram] Bot is alive and listening... Press Ctrl+C to stop.')
  
  // Keep process alive
  // In a real app, this would be part of the main server startup
}

main().catch((error) => {
  console.error('Fatal Error:', error)
  process.exit(1)
})

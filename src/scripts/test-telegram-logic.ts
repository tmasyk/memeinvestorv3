import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { TelegramService } from '../services/TelegramService'

const prisma = new PrismaClient()
const presetManager = new PresetManager()

async function main() {
  console.log('=== Testing Telegram Logic (Offline) ===')

  // Initialize Service with a dummy token (will fail network connection, but logic works)
  const telegramService = new TelegramService('dummy_token', presetManager, prisma)

  console.log('\n--- Test 1: /status ---')
  const statusResponse = await telegramService.simulateCommand('/status')
  console.log('Response:', statusResponse.trim())

  console.log('\n--- Test 2: /preset degen_scalp ---')
  const presetResponse = await telegramService.simulateCommand('/preset degen_scalp')
  console.log('Response:', presetResponse.trim())

  console.log('\n--- Test 3: Verify Status Updated ---')
  const statusResponse2 = await telegramService.simulateCommand('/status')
  console.log('Response:', statusResponse2.trim())

  console.log('\n--- Test 4: /help ---')
  const helpResponse = await telegramService.simulateCommand('/help')
  console.log('Response:', helpResponse.trim())
}

main().catch((error) => {
  console.error('Test Failed:', error)
})

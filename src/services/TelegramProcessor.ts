import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'

export class TelegramProcessor {
  private presetManager: PresetManager
  private prisma: PrismaClient

  constructor(presetManager: PresetManager, prisma: PrismaClient) {
    this.presetManager = presetManager
    this.prisma = prisma
  }

  async handleMessage(text: string): Promise<string> {
    const trimmedText = text.trim()

    // Command: /status
    if (trimmedText === '/status') {
      try {
        const activePresetConfig = this.presetManager.getActivePresetConfig()
        const activePresetName = activePresetConfig ? activePresetConfig.name : 'None'
        
        const openTradesCount = await this.prisma.paperTrade.count({
          where: { status: 'OPEN' }
        })

        return `
🤖 *MemeInvestor V3 Status*
---------------------------
🧠 *Active Brain:* ${activePresetName}
📈 *Open Trades:* ${openTradesCount}
        `
      } catch (error: any) {
        console.error('[Telegram] Error handling /status:', error)
        return `❌ Error fetching status: ${error.message || 'Database connection failed'}`
      }
    }

    // Command: /preset <id>
    if (trimmedText.startsWith('/preset ')) {
      const presetId = trimmedText.split(' ')[1]

      if (!presetId) {
        return '❌ Error: Please specify a preset ID.'
      }

      try {
        this.presetManager.loadPreset(presetId)
        const config = this.presetManager.getActivePresetConfig()
        
        // Extract minUsd for display
        const minLiquidity = config?.filters.find(f => f.name === 'MinLiquidity')?.params.minUsd

        return `✅ Swapped brain to: *${config?.name}*\nTarget Liquidity: $${minLiquidity}`
      } catch (error: any) {
        return `❌ Error: Preset not found or failed to load.`
      }
    }

    // Command: /help
    if (trimmedText === '/help') {
      return `
📚 *Available Commands*
---------------------------
/status - Check bot status and open trades
/preset <id> - Load a specific preset (e.g., degen_scalp, bluechip_safe)
/help - Show this help message
      `
    }

    return '❓ Unknown command. Type /help for a list of commands.'
  }
}

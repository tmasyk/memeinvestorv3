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
    if (trimmedText.startsWith('/preset')) {
      const parts = trimmedText.split(' ')
      // Ensure we handle both "/preset" and "/preset <id>" cleanly
      if (parts.length < 2) {
        return '❌ Error: Please specify a preset ID (e.g., /preset degenscalp).'
      }
      
      const presetId = parts[1].toLowerCase().trim()

      try {
        const success = await this.presetManager.loadPreset(presetId)
        
        if (!success) {
           return `❌ Error: Preset '${presetId}' could not be loaded.`
        }

        const config = this.presetManager.getActivePresetConfig()
        
        // Extract minUsd for display - defensive check
        const liquidityFilter = config?.filters.find(f => f.name === 'MinLiquidity')
        const minLiquidity = liquidityFilter ? liquidityFilter.params.minUsd : 'N/A'

        return `✅ *Swapped Brain Successfully*\n\n🧠 *Active Preset:* ${config?.name}\n💧 *Target Liquidity:* $${minLiquidity}`
      } catch (error: any) {
        console.error(`[Telegram] Error loading preset '${presetId}':`, error)
        return `❌ Error: Preset '${presetId}' not found or failed to load. \n\nCheck available presets with /help.`
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

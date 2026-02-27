import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'

export class TelegramProcessor {
  private presetManager: PresetManager
  private prisma: PrismaClient

  constructor(presetManager: PresetManager, prisma: PrismaClient) {
    this.presetManager = presetManager
    this.prisma = prisma
  }

  async handleMessage(text: string): Promise<string | any> {
    const trimmedText = text.trim()

    // Command: /status or Button: 📊 Status
    if (trimmedText === '/status' || trimmedText === '📊 Status') {
      try {
        const activePresetConfig = this.presetManager.getActivePresetConfig()
        const activePresetName = activePresetConfig ? activePresetConfig.name : 'None'
        
        const openTradesCount = await this.prisma.paperTrade.count({
          where: { status: 'OPEN' }
        })

        // Discovery Stats (24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const scannedCount = await this.prisma.discovery.count({
          where: { timestamp: { gte: oneDayAgo } }
        })
        
        const passedCount = await this.prisma.token.count({
          where: { 
            createdAt: { gte: oneDayAgo },
            status: { in: ['RISK_PASSED', 'FILTER_PASSED'] } 
          }
        })

        return `
🤖 *MemeInvestor V3 Status*
---------------------------
🧠 *Active Brain:* ${activePresetName}
📡 *Tokens Scanned (24h):* ${scannedCount.toLocaleString()}
🎯 *Tokens Passed (24h):* ${passedCount}
📈 *Open Trades:* ${openTradesCount}
        `
      } catch (error: any) {
        console.error('[Telegram] Error handling /status:', error)
        return `❌ Error fetching status: ${error.message || 'Database connection failed'}`
      }
    }

    // Command: 🧠 Switch Preset
    if (trimmedText === '🧠 Switch Preset') {
      try {
        // Fetch all available presets from DB (or fallback to hardcoded if needed)
        // Since we don't have a getAllPresets method on manager, we'll use Prisma directly or just hardcode the known ones for now
        // Ideally, PresetManager should expose getAllPresets().
        
        // For this task, we will fetch from DB to be dynamic
        const presets = await this.prisma.preset.findMany({ select: { id: true, name: true } })
        
        if (presets.length === 0) {
           return '⚠️ No presets found in database.'
        }

        const keyboard = presets.map(p => ([{
          text: p.name,
          callback_data: `preset_${p.id}`
        }]))

        return {
          text: '🧠 *Select a Strategy Brain:*',
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      } catch (error) {
        return '❌ Error fetching presets list.'
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

    // Command: /help or Button: ❓ Help
    if (trimmedText === '/help' || trimmedText === '❓ Help') {
      return `
📚 *Available Commands*
---------------------------
/status - Check bot status and open trades
/preset <id> - Load a specific preset (e.g., degen_scalp, bluechip_safe)
/help - Show this help message
      `
    }

    return '❓ Unknown command. Type /help or use the menu below.'
  }

  // Handle Callback Queries (Inline Buttons)
  async handleCallback(data: string): Promise<{ text: string, reply_markup?: any }> {
    if (data.startsWith('preset_')) {
      const presetId = data.replace('preset_', '')
      
      try {
        const success = await this.presetManager.loadPreset(presetId)
        
        if (!success) return { text: `❌ Failed to load preset: ${presetId}` }

        const config = this.presetManager.getActivePresetConfig()
        const minLiquidity = config?.filters.find(f => f.name === 'MinLiquidity')?.params.minUsd

        // Re-fetch list to show checkmark
        const presets = await this.prisma.preset.findMany({ select: { id: true, name: true } })
        
        const keyboard = presets.map(p => ([{
          text: p.id === presetId ? `✅ ${p.name}` : p.name,
          callback_data: `preset_${p.id}`
        }]))

        return {
          text: `✅ *Brain Swapped!*\n\n🧠 *Active:* ${config?.name}\n💧 *Min Liq:* $${minLiquidity}`,
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      } catch (error) {
        return { text: '❌ Error loading preset.' }
      }
    }

    return { text: '❓ Unknown interaction' }
  }
}

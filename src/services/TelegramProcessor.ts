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
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        const scannedCount = await this.prisma.discovery.count({
          where: { timestamp: { gte: oneHourAgo } }
        })
        
        const lastDiscovery = await this.prisma.discovery.findFirst({
          orderBy: { timestamp: 'desc' }
        })

        // Jito Status Check
        const jitoStatus = process.env.JITO_BLOCK_ENGINE_URL && process.env.TRADING_PRIVATE_KEY 
          ? '🟢 Online (Frankfurt)' 
          : '⚠️ Disabled (Simulation)'

        return `
🤖 *MemeInvestor V3 Dashboard*
---------------------------
🧠 *Brain:* ${activePresetName}
⚡ *Jito:* ${jitoStatus}

📊 *Live Metrics (1h)*
• Scanned: ${scannedCount.toLocaleString()} pools
• Active Positions: ${openTradesCount}

🔍 *Latest Scan*
 • Mint: \`${lastDiscovery?.tokenAddress || 'Waiting...'}\`
 • Time: ${lastDiscovery?.timestamp.toLocaleTimeString() || 'N/A'}
 • Last DB Write: ${lastDiscovery ? lastDiscovery.timestamp.toISOString() : 'Never'}
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
        
        // Command: 🧠 Switch Preset
    if (trimmedText === '🧠 Switch Preset') {
      try {
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

    // Command: /wallet
    if (trimmedText === '/wallet') {
      try {
        const secretManager = (await import('../core/SecretManager')).SecretManager.getInstance()
        
        if (!secretManager.hasTradingCredentials()) {
          return '⚠️ *Wallet Not Configured*\n\nAdd `TRADING_PRIVATE_KEY` to your .env file to enable trading.'
        }

        const { Keypair, Connection, LAMPORTS_PER_SOL } = await import('@solana/web3.js')
        const bs58 = (await import('bs58')).default
        
        const privateKey = secretManager.getTradingPrivateKey()
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
        const publicKey = keypair.publicKey.toString()

        // Fetch Balance
        const { config } = await import('../core/config')
        const connection = new Connection(config.rpcUrl, 'confirmed')
        const balance = await connection.getBalance(keypair.publicKey)
        const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(4)

        return `
👛 *Trading Wallet*
---------------------------
🔑 *Address:* \`${publicKey}\`
💰 *Balance:* ${solBalance} SOL

⚠️ _Never share your private key._
        `
      } catch (error: any) {
        console.error('[Telegram] Wallet command error:', error)
        return `❌ Error fetching wallet info: ${error.message}`
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

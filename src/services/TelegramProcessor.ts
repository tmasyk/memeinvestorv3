import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { EventBus, EventName } from '../core/EventBus'

export class TelegramProcessor {
  private presetManager: PresetManager
  private prisma: PrismaClient
  private eventBus: EventBus
  private scannedPoolsCount: number = 0

  constructor(presetManager: PresetManager, prisma: PrismaClient) {
    this.presetManager = presetManager
    this.prisma = prisma
    this.eventBus = EventBus.getInstance()
    this.setupEventListeners()
  }

  private getMainMenuKeyboard(): any {
    return {
      inline_keyboard: [
        [{ text: '📊 Status', callback_data: 'status' }],
        [{ text: '💼 Trades', callback_data: 'trades' }],
        [{ text: '👛 Wallet', callback_data: 'wallet' }],
        [{ text: '🧠 Switch Preset', callback_data: 'switch_preset' }],
        [{ text: '❓ Help', callback_data: 'help' }]
      ]
    }
  }

  private setupEventListeners() {
    this.eventBus.on(EventName.POOL_SCANNED, () => {
      this.scannedPoolsCount++
    })
  }

  async handleMessage(text: string): Promise<string | any> {
    const trimmedText = text.trim()

    // Command: /start - Always show main menu
    if (trimmedText === '/start') {
      return this.handleMessage('/help')
    }

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
        const discoveredCount = await this.prisma.discovery.count({
          where: { timestamp: { gte: oneHourAgo } }
        })
        
        const lastDiscovery = await this.prisma.discovery.findFirst({
          orderBy: { timestamp: 'desc' }
        })

        // Trading Mode Check
        const { config } = await import('../core/config')
        const tradingMode = config.liveTradingEnabled ? 'LIVE' : 'SIMULATION'

        // Jito Status Check
        const jitoStatus = process.env.JITO_BLOCK_ENGINE_URL && process.env.TRADING_PRIVATE_KEY 
          ? '🟢 Online (Frankfurt)' 
          : '⚠️ Disabled (Simulation)'

        return {
          text: `
🤖 *MemeInvestor V3 Dashboard*
━━━━━━━━━━━━━━━━━━━━
🚀 *Mode:* ${tradingMode}
🧠 *Brain:* ${activePresetName}
⚡ *Jito:* ${jitoStatus}

📊 *Live Metrics (1h)*
• Scanned: ${this.scannedPoolsCount.toLocaleString()} pools
• Discovered: ${discoveredCount.toLocaleString()} tokens
• Active Positions: ${openTradesCount}

🔍 *Latest Scan*
• Mint: \`${lastDiscovery?.tokenAddress || 'Waiting...'}\`
• Time: ${lastDiscovery?.timestamp.toLocaleTimeString() || 'N/A'}
• Last DB Write: ${lastDiscovery ? lastDiscovery.timestamp.toISOString() : 'Never'}
          `,
          reply_markup: this.getMainMenuKeyboard()
        }
      } catch (error: any) {
        console.error('[Telegram] Error handling /status:', error)
        return `❌ Error fetching status: ${error.message || 'Database connection failed'}`
      }
    }

    // Command: 🧠 Switch Preset
    if (trimmedText === '🧠 Switch Preset') {
      try {
        const presets = await this.prisma.preset.findMany({ select: { id: true, name: true } })
        
        if (presets.length === 0) {
           return '⚠️ No presets found in database.'
        }

        const keyboard = presets.map((p: { id: string, name: string }) => ([{
          text: p.name,
          callback_data: `preset_${p.id}`
        }]))

        keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'help' }])

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

        return {
          text: `
👛 *Trading Wallet*
━━━━━━━━━━━━━━━━━━━━
🔑 *Address:* \`${publicKey}\`
💰 *Balance:* ${solBalance} SOL

⚠️ _Never share your private key._
          `,
          reply_markup: this.getMainMenuKeyboard()
        }
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

    // Command: /trades
    if (trimmedText === '/trades') {
      try {
        const activeTrades = await this.prisma.paperTrade.findMany({
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          take: 5
        })

        if (activeTrades.length === 0) {
          return {
            text: '📭 No active paper trades currently.',
            reply_markup: this.getMainMenuKeyboard()
          }
        }

        let message = '📊 *Active Paper Trades (Last 5)*\n\n'
        
        activeTrades.forEach((trade, index) => {
          const currentPrice = trade.entryPrice || 0
          const pnl = 0
          const roi = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          const roiEmoji = roi >= 0 ? '📈' : '📉'
          
          message += `${index + 1}. \`${trade.tokenAddress}\`\n`
          message += `   ${roiEmoji} ROI: ${roi.toFixed(2)}%\n`
          message += `   💰 Amount: ${trade.amount}\n`
          message += `   🕐 Opened: ${trade.createdAt.toLocaleString()}\n\n`
        })

        return {
          text: message,
          reply_markup: this.getMainMenuKeyboard()
        }
      } catch (error: any) {
        console.error('[Telegram] Error handling /trades:', error)
        return `❌ Error fetching active trades: ${error.message || 'Database query failed'}`
      }
    }

    // Command: /help or Button: ❓ Help
    if (trimmedText === '/help' || trimmedText === '❓ Help') {
      return {
        text: `
📚 *Available Commands*
━━━━━━━━━━━━━━━━━━━━
/start - Show main menu
/status - Check bot status and open trades
/trades - List last 5 active paper trades and live ROI
/wallet - Show wallet address and balance
/preset <id> - Load a specific preset (e.g., degen_scalp, bluechip_safe)
/help - Show this help message
        `,
        reply_markup: this.getMainMenuKeyboard()
      }
    }

    return '❓ Unknown command. Type /help or use the menu below.'
  }

  // Handle Callback Queries (Inline Buttons)
  async handleCallback(data: string): Promise<{ text: string, reply_markup?: any }> {
    try {
      if (data === 'status') {
        const statusResponse = await this.handleMessage('/status')
        return typeof statusResponse === 'string' 
          ? { text: statusResponse }
          : statusResponse
      }

      if (data === 'trades') {
        const tradesResponse = await this.handleMessage('/trades')
        return typeof tradesResponse === 'string'
          ? { text: tradesResponse }
          : tradesResponse
      }

      if (data === 'wallet') {
        const walletResponse = await this.handleMessage('/wallet')
        return typeof walletResponse === 'string'
          ? { text: walletResponse }
          : walletResponse
      }

      if (data === 'help') {
        const helpResponse = await this.handleMessage('/help')
        return typeof helpResponse === 'string'
          ? { text: helpResponse }
          : helpResponse
      }

      if (data === 'switch_preset') {
        const switchResponse = await this.handleMessage('🧠 Switch Preset')
        return typeof switchResponse === 'string'
          ? { text: switchResponse }
          : switchResponse
      }

      if (data.startsWith('preset_')) {
        const presetId = data.replace('preset_', '')
        
        const success = await this.presetManager.loadPreset(presetId)
        
        if (!success) return { text: `❌ Failed to load preset: ${presetId}` }

        const config = this.presetManager.getActivePresetConfig()
        const minLiquidity = config?.filters.find(f => f.name === 'MinLiquidity')?.params.minUsd

        return {
          text: `✅ *Brain Swapped!*\n\n🧠 *Active:* ${config?.name}\n💧 *Min Liq:* $${minLiquidity}`,
          reply_markup: this.getMainMenuKeyboard()
        }
      }

      return { text: '❓ Unknown interaction' }
    } catch (error) {
      return { text: '❌ Error processing callback.' }
    }
  }
}

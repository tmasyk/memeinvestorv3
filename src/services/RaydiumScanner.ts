import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js'
import { config } from '../core/config'
import { RpcConnectionManager } from '../core/RpcConnectionManager'
import { ScannerService } from './ScannerService'

export class RaydiumScanner {
  private connection: Connection
  private scannerService: ScannerService
  private rpcManager: RpcConnectionManager
  private raydiumProgramId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
  private logsSubscriptionId: number | null = null

  constructor(scannerService: ScannerService) {
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed'
    })
    this.scannerService = scannerService
    this.rpcManager = RpcConnectionManager.getInstance()
  }

  async start() {
    console.log('[RaydiumScanner] Starting live scanner via RpcConnectionManager...')
    
    if (!this.rpcManager.isConnected()) {
      console.log('[RaydiumScanner] Waiting for RPC connection...')
      this.rpcManager.once('connected', () => this.initializeSubscription())
    } else {
      this.initializeSubscription()
    }
  }

  private async initializeSubscription() {
    try {
      this.logsSubscriptionId = await this.rpcManager.subscribeToLogs(
        this.raydiumProgramId,
        async (logs: any) => {
          await this.handleLogs(logs)
        }
      )
      console.log(`[RaydiumScanner] Subscribed to logs via singleton WebSocket. ID: ${this.logsSubscriptionId}`)
    } catch (error) {
      console.error('[RaydiumScanner] Failed to subscribe:', error)
    }
  }

  private async handleLogs(logs: any) {
    try {
      if (logs.err) return

      const isInitialization = logs.logs.some((log: string) => log.includes('initialize2'))
      
      if (isInitialization && logs.signature) {
        console.log(`[RaydiumScanner] Potential new pool detected! Signature: ${logs.signature}`)
        await this.processTransaction(logs.signature)
      }
    } catch (error) {
      console.error('[RaydiumScanner] Error handling logs:', error)
    }
  }

  private async processTransaction(signature: string) {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      })

      if (!tx) {
        console.warn(`[RaydiumScanner] Could not fetch transaction ${signature}`)
        return
      }

      const tokenData = this.parseTokenData(tx)
      
      if (tokenData) {
        console.log(`[Scanner] Raw Event Detected: ${tokenData.address}`)
        console.log(`[RaydiumScanner] New Token Discovered: ${tokenData.address} (${tokenData.symbol})`)
        await this.scannerService.processNewToken(tokenData)
      }
    } catch (error) {
      console.error(`[RaydiumScanner] Error processing transaction ${signature}:`, error)
    }
  }

  private parseTokenData(tx: ParsedTransactionWithMeta): any | null {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

    const tokenBalances = tx.meta?.postTokenBalances || []
    const involvedMints = [...new Set(tokenBalances.map((b: any) => b.mint))]
    
    const candidateMints = involvedMints.filter((mint: string) => 
      mint !== SOL_MINT && mint !== USDC_MINT
    )

    if (candidateMints.length > 0) {
      return {
        address: candidateMints[0],
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 6,
        liquidity: 0,
        volume24h: 0
      }
    }

    return null
  }

  async stop() {
    if (this.logsSubscriptionId !== null) {
      try {
        await this.rpcManager.unsubscribe(this.logsSubscriptionId)
        console.log('[RaydiumScanner] Unsubscribed from logs')
      } catch (error) {
        console.error('[RaydiumScanner] Error unsubscribing:', error)
      }
      this.logsSubscriptionId = null
    }
  }
}

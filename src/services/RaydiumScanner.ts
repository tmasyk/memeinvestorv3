import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js'
import { config } from '../core/config'
import { ScannerService } from './ScannerService'

export class RaydiumScanner {
  private connection: Connection
  private scannerService: ScannerService
  private raydiumProgramId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')
  private subscriptionId: number | null = null

  constructor(scannerService: ScannerService) {
    this.connection = new Connection(config.rpcUrl, {
      wsEndpoint: config.wsUrl || undefined,
      commitment: 'confirmed'
    })
    this.scannerService = scannerService
  }

  start() {
    console.log('[RaydiumScanner] Starting live scanner...')
    
    try {
      this.subscriptionId = this.connection.onLogs(
        this.raydiumProgramId,
        async (logs, context) => {
          if (logs.err) return

          // Filter for "initialize2" which indicates a new pool creation
          const isInitialization = logs.logs.some(log => log.includes('initialize2'))
          
          if (isInitialization) {
            console.log(`[RaydiumScanner] Potential new pool detected! Signature: ${logs.signature}`)
            await this.processTransaction(logs.signature)
          }
        },
        'confirmed'
      )
      console.log(`[RaydiumScanner] Subscribed to logs with ID: ${this.subscriptionId}`)
    } catch (error) {
      console.error('[RaydiumScanner] Failed to subscribe:', error)
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
        console.log(`[RaydiumScanner] New Token Discovered: ${tokenData.address} (${tokenData.symbol})`)
        await this.scannerService.processNewToken(tokenData)
      } else {
        console.log(`[RaydiumScanner] Failed to parse token data for tx: ${signature}`)
      }
    } catch (error) {
      console.error(`[RaydiumScanner] Error processing transaction ${signature}:`, error)
    }
  }

  private parseTokenData(tx: ParsedTransactionWithMeta): any | null {
    // This is a simplified parser. 
    // Real Raydium parsing requires decoding inner instructions or analyzing account keys by index.
    // For V4 AMM initialize2, the accounts usually follow a specific order.
    // Account 8 is usually the PC Mint (Quote - e.g. SOL/USDC)
    // Account 9 is usually the Coin Mint (Base - e.g. MEME)
    // OR vice versa depending on sorting.
    
    // However, parsing from `tx.transaction.message.accountKeys` is safer if we know the index.
    // Let's try to extract mints from the postTokenBalances to be safer, 
    // finding the ones that have a large balance change or are newly created.
    
    // A robust heuristic for "The Meme Token":
    // It's the mint that isn't SOL (So111...) or USDC.
    
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

    // Look at post token balances to find the mints involved
    const tokenBalances = tx.meta?.postTokenBalances || []
    
    // We expect at least 2 mints involved (Base and Quote)
    const involvedMints = [...new Set(tokenBalances.map(b => b.mint))]
    
    const candidateMints = involvedMints.filter(mint => 
      mint !== SOL_MINT && mint !== USDC_MINT
    )

    if (candidateMints.length > 0) {
      // Pick the first candidate
      const tokenAddress = candidateMints[0]
      
      // In a real app, we would fetch metadata (Symbol, Name) via Metaplex
      // For now, we mock it or extract if available in logs (unlikely)
      // We'll return a basic object
      
      return {
        address: tokenAddress,
        symbol: 'UNKNOWN', // Would need fetchMetadata
        name: 'Unknown Token', // Would need fetchMetadata
        decimals: 6, // Default or fetch
        liquidity: 0, // Would need to calculate from the SOL balance of the pool
        volume24h: 0
      }
    }

    return null
  }
}

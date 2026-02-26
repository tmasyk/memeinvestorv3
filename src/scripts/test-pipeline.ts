import '../core/config'
import { PrismaClient } from '@prisma/client'
import { MinLiquidityFilter } from '../plugins/filters/MinLiquidityFilter'
import { MintRevokedCheck } from '../plugins/risk/MintRevokedCheck'
import { ScannerService } from '../services/ScannerService'
import { PositionManager } from '../services/PositionManager'
import { TradingEngine } from '../services/TradingEngine'

const prisma = new PrismaClient()

// Instantiate Plugins
const minLiquidityFilter = new MinLiquidityFilter()
const mintRevokedCheck = new MintRevokedCheck()

// Instantiate Services
const positionManager = new PositionManager()
const tradingEngine = new TradingEngine(prisma, positionManager)

// Instantiate Scanner Service with both Filters and Risk Plugins
const scannerService = new ScannerService(
  [minLiquidityFilter],
  [mintRevokedCheck],
  prisma
)

const mockToken = {
  address: 'SAFE_MEME_999',
  symbol: 'SAFE',
  name: 'Safe Meme Token',
  decimals: 6,
  liquidity: 20000,
  volume24h: 500000
}

async function main() {
  try {
    console.log('=== Testing Phase 1 & 2 Pipeline ===')
    
    // Step 1: Clear Database
    console.log('Clearing database...')
    await prisma.paperTrade.deleteMany().catch(() => {})
    await prisma.pendingTrade.deleteMany()
    await prisma.token.deleteMany()
    
    // Step 2: Process New Token (Filter Phase)
    console.log(`\nProcessing token: ${mockToken.address} (Liquidity: $${mockToken.liquidity})`)
    // Note: evaluateRisk is automatically called inside processNewToken if it passes filters
    await scannerService.processNewToken(mockToken)
    
    // Step 3: Verify Database State
    console.log('\n=== Verification ===')
    
    const token = await prisma.token.findUnique({
      where: { address: mockToken.address }
    })
    
    if (token) {
      console.log(`Token Status: ${token.status}`)
    } else {
      console.error('Token not found in database!')
    }
    
    const pendingTrades = await prisma.pendingTrade.findMany({
      where: { tokenAddress: mockToken.address }
    })
    
    console.log(`Pending Trades Queue Length: ${pendingTrades.length}`)
    
    if (pendingTrades.length > 0) {
      const trade = pendingTrades[0]
      console.log(`Trade Status: ${trade.status}`)
      console.log(`Risk Score: ${trade.riskScore}`)
    }
    
    // Step 4: Execution Phase
    console.log('\n=== PHASE 3: Execution ===')
    await tradingEngine.processQueue()

    const paperTrades = await prisma.paperTrade.findMany({
      where: { tokenAddress: mockToken.address }
    })

    console.log(`Paper Trades Count: ${paperTrades.length}`)
    if (paperTrades.length > 0) {
      console.log(`Paper Trade Status: ${paperTrades[0].status}`)
    }

    const updatedPendingTrade = await prisma.pendingTrade.findFirst({
      where: { tokenAddress: mockToken.address }
    })
    
    if (updatedPendingTrade) {
      console.log(`Updated PendingTrade Status: ${updatedPendingTrade.status}`)
    }

    // Step 5: Exit Phase
    console.log('\n=== PHASE 3.5: Exit & Cleanup ===')
    await tradingEngine.monitorAndExit(mockToken.address)

    const closedTrades = await prisma.paperTrade.findMany({
      where: {
        tokenAddress: mockToken.address,
        status: 'CLOSED'
      }
    })

    if (closedTrades.length > 0) {
      console.log(`Trade Closed Successfully. Exit Price: ${closedTrades[0].exitPrice}`)
    } else {
      console.error('Trade failed to close!')
    }

  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

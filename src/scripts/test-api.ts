import { PrismaClient } from '@prisma/client'
import { PresetManager } from '../core/PresetManager'
import { ApiServer } from '../api/server'

const prisma = new PrismaClient()
const presetManager = new PresetManager()
const apiServer = new ApiServer(prisma, presetManager)

const PORT = 3000

async function main() {
  console.log('=== Starting API Test ===')
  
  // Start the server
  apiServer.start(PORT)
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000))

  try {
    // 1. Check Initial Health
    console.log('\n--- 1. Initial Health Check ---')
    const initialHealth = await fetch(`http://localhost:${PORT}/api/health`).then(res => res.json())
    console.log('Response:', initialHealth)

    // 2. Set Preset
    console.log('\n--- 2. Setting Preset: aggressive_meme ---')
    const presetResponse = await fetch(`http://localhost:${PORT}/api/preset/aggressive_meme`, {
      method: 'POST'
    }).then(res => res.json())
    console.log('Response:', presetResponse)

    // 3. Check Health Again (Verify Preset Changed)
    console.log('\n--- 3. Verifying Preset Change ---')
    const updatedHealth = await fetch(`http://localhost:${PORT}/api/health`).then(res => res.json())
    console.log('Response:', updatedHealth)

    // 4. Fetch Trades
    console.log('\n--- 4. Fetching Trades ---')
    const trades = await fetch(`http://localhost:${PORT}/api/trades`).then(res => res.json())
    console.log(`Fetched ${Array.isArray(trades) ? trades.length : 0} trades`)

    console.log('\n=== Test Complete ===')
  } catch (error) {
    console.error('Test Failed:', error)
  } finally {
    process.exit(0)
  }
}

main()

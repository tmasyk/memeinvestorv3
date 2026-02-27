import { config } from './config'
import { SecretManager } from './SecretManager'
import { PresetManager } from './PresetManager'
import { PrismaClient } from '@prisma/client'

interface LatencyMetrics {
  poolDetected: number
  simulationConfirmed: number
  latency: number
}

export class JitoManager {
  private static instance: JitoManager
  private secretManager: SecretManager
  private presetManager: PresetManager
  private prisma: PrismaClient
  private requestQueue: number[] = []
  private readonly rateLimitWindowMs = 1000
  private readonly maxRequestsPerSecond = config.jitoRateLimit || 5
  private latencyMetrics: Map<string, LatencyMetrics> = new Map()
  private readonly TARGET_LATENCY_MS = 200

  private constructor(secretManager: SecretManager, presetManager: PresetManager, prisma: PrismaClient) {
    this.secretManager = secretManager
    this.presetManager = presetManager
    this.prisma = prisma
  }

  static getInstance(secretManager?: SecretManager, presetManager?: PresetManager, prisma?: PrismaClient): JitoManager {
    if (!JitoManager.instance) {
      if (!secretManager || !presetManager || !prisma) {
        throw new Error('JitoManager requires secretManager, presetManager, and prisma on first initialization')
      }
      JitoManager.instance = new JitoManager(secretManager, presetManager, prisma)
    }
    return JitoManager.instance
  }

  private getTipAmount(): number {
    const activePreset = this.presetManager.getActivePresetConfig()
    if (!activePreset) {
      return 0.001
    }

    return activePreset.jitoTip || 0.001
  }

  private async logSimulationError(tokenAddress: string, errorCode: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.discovery.updateMany({
        where: { tokenAddress },
        data: {
          reason: `Jito Error: ${errorCode} - ${errorMessage}`
        }
      })
      console.log(`[JitoManager] Logged simulation error for ${tokenAddress}: ${errorCode}`)
    } catch (error) {
      console.error(`[JitoManager] Failed to log simulation error:`, error)
    }
  }

  private recordLatency(bundleId: string, poolDetectedTime: number): void {
    const simulationConfirmedTime = Date.now()
    const latency = simulationConfirmedTime - poolDetectedTime
    
    this.latencyMetrics.set(bundleId, {
      poolDetected: poolDetectedTime,
      simulationConfirmed: simulationConfirmedTime,
      latency
    })

    if (latency > this.TARGET_LATENCY_MS) {
      console.warn(`[JitoManager] ⚠️ LATENCY WARNING: ${latency}ms (Target: <${this.TARGET_LATENCY_MS}ms)`)
    } else {
      console.log(`[JitoManager] ✅ Latency OK: ${latency}ms (Target: <${this.TARGET_LATENCY_MS}ms)`)
    }
  }

  getAverageLatency(sampleSize: number = 10): number {
    const latencies = Array.from(this.latencyMetrics.values())
      .map(m => m.latency)
      .slice(-sampleSize)

    if (latencies.length === 0) {
      return 0
    }

    const sum = latencies.reduce((acc, curr) => acc + curr, 0)
    return Math.round(sum / latencies.length)
  }

  getLatencyStatus(): { average: number; target: number; status: string; emoji: string } {
    const average = this.getAverageLatency(10)
    const target = this.TARGET_LATENCY_MS
    const isOnTarget = average <= target

    return {
      average,
      target,
      status: isOnTarget ? 'On Target' : 'Slow',
      emoji: isOnTarget ? '🟢' : '🔴'
    }
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    const oneSecondAgo = now - this.rateLimitWindowMs

    this.requestQueue = this.requestQueue.filter(timestamp => timestamp > oneSecondAgo)

    if (this.requestQueue.length >= this.maxRequestsPerSecond) {
      const waitTime = this.requestQueue[0] + this.rateLimitWindowMs - now
      console.log(`[JitoManager] Rate limit reached. Waiting ${waitTime}ms...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    this.requestQueue.push(now)
  }

  async simulateBundle(bundleId: string, tokenAddress: string, poolDetectedTime: number): Promise<{ success: boolean; error?: string }> {
    if (!config.jitoBlockEngineUrl) {
      return { success: false, error: 'Jito disabled' }
    }

    await this.checkRateLimit()

    const tipAmount = this.getTipAmount()
    console.log(`[JitoManager] Simulating bundle ${bundleId} via ${config.jitoBlockEngineUrl}...`)
    console.log(`[JitoManager] Tip Amount: ${tipAmount} SOL (based on preset)`)
    
    try {
      const startTime = Date.now()

      const response = await fetch(config.jitoBlockEngineUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'simulateTransactions',
          params: {
            transactions: [],
            tip: tipAmount
          }
        })
      })

      const endTime = Date.now()
      this.recordLatency(bundleId, poolDetectedTime)

      if (!response.ok) {
        const errorData = await response.json() as any
        const errorCode = errorData.error?.code || 'UnknownError'
        const errorMessage = errorData.error?.message || 'Unknown error'
        
        console.error(`[JitoManager] Simulation failed for ${tokenAddress}: ${errorCode} - ${errorMessage}`)
        await this.logSimulationError(tokenAddress, errorCode, errorMessage)
        
        return { success: false, error: errorCode }
      }

      const result = await response.json()
      console.log(`[JitoManager] Simulation confirmed for ${bundleId}`)
      
      return { success: true }
    } catch (error: any) {
      console.error(`[JitoManager] Simulation error for ${tokenAddress}:`, error)
      
      const errorCode = error.code || 'NetworkError'
      const errorMessage = error.message || 'Network connection failed'
      await this.logSimulationError(tokenAddress, errorCode, errorMessage)
      
      return { success: false, error: errorCode }
    }
  }

  async sendBundle(bundleId: string, tokenAddress: string): Promise<string | null> {
    if (!config.jitoBlockEngineUrl) {
      return null
    }

    await this.checkRateLimit()

    const tipAmount = this.getTipAmount()
    console.log(`[JitoManager] Sending bundle ${bundleId} to Block Engine...`)
    console.log(`[JitoManager] Tip Amount: ${tipAmount} SOL (based on preset)`)

    try {
      const response = await fetch(config.jitoBlockEngineUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: {
            transactions: [],
            tip: tipAmount
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json() as any
        const errorCode = errorData.error?.code || 'UnknownError'
        const errorMessage = errorData.error?.message || 'Unknown error'
        
        console.error(`[JitoManager] Bundle failed for ${tokenAddress}: ${errorCode} - ${errorMessage}`)
        await this.logSimulationError(tokenAddress, errorCode, errorMessage)
        
        return null
      }

      const result = await response.json() as any
      const bundleResultId = result.result || `bundle-${Date.now()}`
      console.log(`[JitoManager] Bundle sent successfully: ${bundleResultId}`)
      
      return bundleResultId
    } catch (error: any) {
      console.error(`[JitoManager] Bundle error for ${tokenAddress}:`, error)
      
      const errorCode = error.code || 'NetworkError'
      const errorMessage = error.message || 'Network connection failed'
      await this.logSimulationError(tokenAddress, errorCode, errorMessage)
      
      return null
    }
  }
}

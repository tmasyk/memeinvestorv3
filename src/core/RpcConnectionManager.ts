import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { config } from './config'

interface RpcConnectionManagerOptions {
  heartbeatTimeoutMs?: number
  reconnectDelayMs?: number
}

export class RpcConnectionManager extends EventEmitter {
  private static instance: RpcConnectionManager
  private ws: WebSocket | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private isConnecting: boolean = false
  private subscriptionCount: number = 0
  private maxSubscriptions: number = 10
  private subscriptionCallbacks: Map<number, (data: any) => void> = new Map()
  private nextRequestId: number = 1

  private readonly heartbeatTimeoutMs: number
  private readonly reconnectDelayMs: number

  private constructor(options: RpcConnectionManagerOptions = {}) {
    super()
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 15000
    this.reconnectDelayMs = options.reconnectDelayMs ?? 5000
  }

  static getInstance(options?: RpcConnectionManagerOptions): RpcConnectionManager {
    if (!RpcConnectionManager.instance) {
      RpcConnectionManager.instance = new RpcConnectionManager(options)
    }
    return RpcConnectionManager.instance
  }

  connect(): void {
    if (!config.rpcUrl) {
      throw new Error('FATAL: No RPC_URL found in .env. Cannot connect to Solana Mainnet.')
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.emit('error', new Error('Connection already exists'))
      return
    }

    if (this.isConnecting) {
      return
    }

    this.isConnecting = true

    // Use WebSocket URL from env if available, otherwise derive from RPC URL or config default
    // Note: config.wsUrl is already parsed/validated in config.ts, but let's be explicit about the fallback
    // logic if we were using raw env vars. Since we use config.ts, we rely on it.
    // However, the prompt asks to update the Connection object (which is usually web3.js Connection)
    // BUT this class uses raw WebSocket.
    
    // Wait, the prompt says "Update the Connection object to explicitly use the WebSocket endpoint if provided".
    // This usually refers to @solana/web3.js Connection class.
    // But RpcConnectionManager is using 'ws' library directly.
    
    // Let's check RaydiumScanner.ts which uses @solana/web3.js Connection.
    // AND let's update RpcConnectionManager to ensure it uses the correct WS URL.
    
    console.log(`[System] Attempting connection to RPC: ${config.rpcUrl}`)
    console.log(`[RpcConnectionManager] Connecting to ${config.wsUrl}...`)
    this.ws = new WebSocket(config.wsUrl)

    this.ws.on('open', () => {
      this.isConnecting = false
      this.emit('connected')
      this.subscribeToSlots()
      this.resetHeartbeat()
    })

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.method === 'slotNotification') {
          this.resetHeartbeat()
        }

        if (message.params && message.params.result) {
          const subscriptionId = message.params.result
          const callback = this.subscriptionCallbacks.get(subscriptionId)
          if (callback) {
            callback(message.params)
          }
        }

        this.emit('message', message)
      } catch (error) {
        this.emit('error', error)
      }
    })

    this.ws.on('error', (error: Error) => {
      this.isConnecting = false
      this.emit('error', error)
    })

    this.ws.on('close', () => {
      this.isConnecting = false
      this.clearHeartbeat()
      this.subscriptionCount = 0
      this.emit('disconnected')
    })
  }

  private subscribeToSlots(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const subscriptionMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'slotSubscribe',
      params: []
    }

    this.ws.send(JSON.stringify(subscriptionMessage))
    this.subscriptionCount++
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat()
    this.heartbeatTimer = setTimeout(() => {
      console.warn('WARNING: Heartbeat timeout - no slot updates for 15 seconds')
      this.emit('heartbeatTimeout')
      this.reconnect()
    }, this.heartbeatTimeoutMs)
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private reconnect(): void {
    if (this.reconnectTimer) {
      return
    }

    this.disconnect()

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      console.log(`Reconnecting after ${this.reconnectDelayMs}ms delay...`)
      this.connect()
    }, this.reconnectDelayMs)
  }

  disconnect(): void {
    this.clearHeartbeat()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.isConnecting = false
    this.subscriptionCount = 0
  }

  send(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    this.ws.send(JSON.stringify(message))
  }

  getAvailableSubscriptions(): number {
    return this.maxSubscriptions - this.subscriptionCount
  }

  getSubscriptionCount(): number {
    return this.subscriptionCount
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  isReady(): boolean {
    return this.isConnected() && this.subscriptionCount > 0
  }

  async subscribeToLogs(
    programId: string,
    callback: (logs: any) => void
  ): Promise<number> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    if (this.getAvailableSubscriptions() <= 0) {
      throw new Error('No available subscription slots')
    }

    const requestId = this.nextRequestId++

    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [programId]
        },
        {
          commitment: 'confirmed'
        }
      ]
    }

    this.ws.send(JSON.stringify(message))

    const subscriptionId = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscription timeout'))
      }, 5000)

      const messageHandler = (msg: any) => {
        if (msg.id === requestId) {
          clearTimeout(timeout)
          this.subscriptionCallbacks.set(msg.result, callback)
          resolve(msg.result)
        }
      }

      this.once('message', messageHandler)
    })

    this.subscriptionCount++
    return subscriptionId
  }

  async subscribeToAccount(
    publicKey: string,
    callback: (accountInfo: any) => void
  ): Promise<number> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    if (this.getAvailableSubscriptions() <= 0) {
      throw new Error('No available subscription slots')
    }

    const requestId = this.nextRequestId++

    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'accountSubscribe',
      params: [
        publicKey,
        {
          encoding: 'base64',
          commitment: 'confirmed'
        }
      ]
    }

    this.ws.send(JSON.stringify(message))

    const subscriptionId = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscription timeout'))
      }, 5000)

      const messageHandler = (msg: any) => {
        if (msg.id === requestId) {
          clearTimeout(timeout)
          this.subscriptionCallbacks.set(msg.result, callback)
          resolve(msg.result)
        }
      }

      this.once('message', messageHandler)
    })

    this.subscriptionCount++
    return subscriptionId
  }

  async unsubscribe(subscriptionId: number): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const requestId = this.nextRequestId++

    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'logsUnsubscribe',
      params: [subscriptionId]
    }

    this.ws.send(JSON.stringify(message))

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Unsubscribe timeout'))
      }, 5000)

      const messageHandler = (msg: any) => {
        if (msg.id === requestId) {
          clearTimeout(timeout)
          this.subscriptionCallbacks.delete(subscriptionId)
          this.subscriptionCount--
          resolve()
        }
      }

      this.once('message', messageHandler)
    })
  }

  async unsubscribeAccount(subscriptionId: number): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const requestId = this.nextRequestId++

    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'accountUnsubscribe',
      params: [subscriptionId]
    }

    this.ws.send(JSON.stringify(message))

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Unsubscribe timeout'))
      }, 5000)

      const messageHandler = (msg: any) => {
        if (msg.id === requestId) {
          clearTimeout(timeout)
          this.subscriptionCallbacks.delete(subscriptionId)
          this.subscriptionCount--
          resolve()
        }
      }

      this.once('message', messageHandler)
    })
  }
}

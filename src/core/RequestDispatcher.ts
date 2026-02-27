import { EventEmitter } from 'events'

export enum RequestPriority {
  CRITICAL = 1,
  STANDARD = 2
}

interface QueuedRequest {
  id: number
  priority: RequestPriority
  request: () => Promise<any>
  resolve: (value: any) => void
  reject: (reason: any) => void
  timestamp: number
}

export class RequestDispatcher extends EventEmitter {
  private static instance: RequestDispatcher
  private priority1Queue: QueuedRequest[] = []
  private priority2Queue: QueuedRequest[] = []
  private isProcessing: boolean = false
  private nextRequestId: number = 1

  private requestCount: number = 0
  private requestWindowStart: number = Date.now()
  private readonly maxRequestsPerSecond: number = 50
  private readonly windowMs: number = 1000

  private constructor() {
    super()
  }

  static getInstance(): RequestDispatcher {
    if (!RequestDispatcher.instance) {
      RequestDispatcher.instance = new RequestDispatcher()
    }
    return RequestDispatcher.instance
  }

  async executeRequest(
    requestFn: () => Promise<any>,
    priority: RequestPriority = RequestPriority.STANDARD
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: this.nextRequestId++,
        priority,
        request: requestFn,
        resolve,
        reject,
        timestamp: Date.now()
      }

      if (priority === RequestPriority.CRITICAL) {
        this.priority1Queue.push(queuedRequest)
        console.log(`[RequestDispatcher] Priority 1 request queued (ID: ${queuedRequest.id})`)
      } else {
        this.priority2Queue.push(queuedRequest)
        console.log(`[RequestDispatcher] Priority 2 request queued (ID: ${queuedRequest.id})`)
      }

      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    while (this.hasAvailableRequests()) {
      if (!this.canExecuteRequest()) {
        const waitTime = this.getWaitTime()
        if (waitTime > 0) {
          console.log(`[RequestDispatcher] Rate limit reached. Waiting ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
      }

      const request = this.getNextRequest()
      if (!request) {
        break
      }

      try {
        this.recordRequest()
        const result = await request.request()
        request.resolve(result)
        console.log(`[RequestDispatcher] Request completed (ID: ${request.id}, Priority: ${request.priority})`)
      } catch (error) {
        request.reject(error)
        console.error(`[RequestDispatcher] Request failed (ID: ${request.id}):`, error)
      }
    }

    this.isProcessing = false
  }

  private hasAvailableRequests(): boolean {
    return this.priority1Queue.length > 0 || this.priority2Queue.length > 0
  }

  private canExecuteRequest(): boolean {
    const now = Date.now()
    const windowElapsed = now - this.requestWindowStart

    if (windowElapsed >= this.windowMs) {
      this.requestCount = 0
      this.requestWindowStart = now
      return true
    }

    return this.requestCount < this.maxRequestsPerSecond
  }

  private getWaitTime(): number {
    const now = Date.now()
    const windowElapsed = now - this.requestWindowStart

    if (windowElapsed >= this.windowMs) {
      return 0
    }

    const requestsRemaining = this.maxRequestsPerSecond - this.requestCount
    if (requestsRemaining > 0) {
      return 0
    }

    return this.windowMs - windowElapsed
  }

  private getNextRequest(): QueuedRequest | null {
    if (this.priority1Queue.length > 0) {
      return this.priority1Queue.shift() || null
    }

    if (this.priority2Queue.length > 0) {
      return this.priority2Queue.shift() || null
    }

    return null
  }

  private recordRequest(): void {
    const now = Date.now()
    const windowElapsed = now - this.requestWindowStart

    if (windowElapsed >= this.windowMs) {
      this.requestCount = 0
      this.requestWindowStart = now
    }

    this.requestCount++

    if (this.requestCount > this.maxRequestsPerSecond) {
      console.warn(`[RequestDispatcher] ⚠️ RATE LIMIT EXCEEDED: ${this.requestCount}/${this.maxRequestsPerSecond} requests/sec`)
    }
  }

  getQueueStatus(): { p1: number; p2: number; currentRps: number; windowElapsed: number } {
    const now = Date.now()
    const windowElapsed = now - this.requestWindowStart

    return {
      p1: this.priority1Queue.length,
      p2: this.priority2Queue.length,
      currentRps: this.requestCount,
      windowElapsed
    }
  }

  reset(): void {
    this.priority1Queue = []
    this.priority2Queue = []
    this.requestCount = 0
    this.requestWindowStart = Date.now()
    console.log('[RequestDispatcher] Dispatcher reset')
  }
}

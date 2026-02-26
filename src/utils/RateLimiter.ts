class RateLimiter {
  private maxRequestsPerSecond: number
  private requestTimestamps: number[] = []
  private queue: Array<() => void> = []

  constructor(maxRequestsPerSecond: number = 50) {
    this.maxRequestsPerSecond = maxRequestsPerSecond
  }

  async acquire(): Promise<void> {
    const now = Date.now()

    this.requestTimestamps = this.requestTimestamps.filter(timestamp => now - timestamp < 1000)

    if (this.requestTimestamps.length < this.maxRequestsPerSecond) {
      this.requestTimestamps.push(now)
      return
    }

    const oldestTimestamp = this.requestTimestamps[0]
    const waitTime = 1000 - (now - oldestTimestamp)

    if (waitTime > 0) {
      await this.delay(waitTime)
      return this.acquire()
    }

    this.requestTimestamps.push(now)
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    return fn()
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getRemainingCapacity(): number {
    const now = Date.now()
    const recentRequests = this.requestTimestamps.filter(timestamp => now - timestamp < 1000)
    return Math.max(0, this.maxRequestsPerSecond - recentRequests.length)
  }

  getCurrentRate(): number {
    const now = Date.now()
    const recentRequests = this.requestTimestamps.filter(timestamp => now - timestamp < 1000)
    return recentRequests.length
  }
}

export default RateLimiter

import dotenv from 'dotenv'

dotenv.config()

export class SecretManager {
  private static instance: SecretManager
  
  // Using private readonly fields to prevent accidental modification
  private readonly tradingPrivateKey: string
  private readonly jitoUuid: string | null

  private constructor() {
    const pk = process.env.TRADING_PRIVATE_KEY
    if (!pk) {
      console.warn('[SecretManager] TRADING_PRIVATE_KEY not found in env. Trading will be disabled.')
      this.tradingPrivateKey = ''
    } else {
      this.tradingPrivateKey = pk
    }

    const uuid = process.env.JITO_UUID
    this.jitoUuid = uuid || null
  }

  static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager()
    }
    return SecretManager.instance
  }

  getTradingPrivateKey(): string {
    if (!this.tradingPrivateKey) {
      throw new Error('Trading Private Key is not configured.')
    }
    return this.tradingPrivateKey
  }

  getJitoUuid(): string | null {
    return this.jitoUuid
  }

  hasTradingCredentials(): boolean {
    return !!this.tradingPrivateKey
  }
}

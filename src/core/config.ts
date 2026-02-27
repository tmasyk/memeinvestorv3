import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  RPC_URL: z.string().url(),
  WS_URL: z.string().url().startsWith('wss://'),
  ENV: z.enum(['development', 'production']),
  JITO_BLOCK_ENGINE_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string(),
  LIVE_TRADING_ENABLED: z.string().transform((val) => val.toLowerCase() === 'true').default('false'),
  MAX_TRADE_SOL: z.string().transform((val) => parseFloat(val)).default('0.05')
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const missingFields = parsedEnv.error.errors.map((err: z.ZodIssue) => err.path.join('.')).join(', ')
  throw new Error(`FATAL: Missing or invalid environment variables: ${missingFields}`)
}

if (!parsedEnv.data.JITO_BLOCK_ENGINE_URL) {
  console.warn('WARNING: JITO_BLOCK_ENGINE_URL is missing. Jito bundles will be disabled, falling back to standard RPC transactions.')
}

export const config = {
  databaseUrl: parsedEnv.data.DATABASE_URL,
  rpcUrl: parsedEnv.data.RPC_URL,
  wsUrl: parsedEnv.data.WS_URL,
  env: parsedEnv.data.ENV,
  jitoBlockEngineUrl: parsedEnv.data.JITO_BLOCK_ENGINE_URL,
  telegramBotToken: parsedEnv.data.TELEGRAM_BOT_TOKEN,
  liveTradingEnabled: parsedEnv.data.LIVE_TRADING_ENABLED,
  maxTradeSol: parsedEnv.data.MAX_TRADE_SOL,
  // Hardcoded constant for Jito simulation rate limit
  jitoRateLimit: 5 
}
// Force rebuild

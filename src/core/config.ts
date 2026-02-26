import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  RPC_URL: z.string().url(),
  WS_URL: z.string().url().startsWith('wss://'),
  ENV: z.enum(['development', 'production']),
  JITO_BLOCK_ENGINE_URL: z.string().url()
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const missingFields = parsedEnv.error.errors.map((err: z.ZodIssue) => err.path.join('.')).join(', ')
  throw new Error(`FATAL: Missing or invalid environment variables: ${missingFields}`)
}

export const config = {
  databaseUrl: parsedEnv.data.DATABASE_URL,
  rpcUrl: parsedEnv.data.RPC_URL,
  wsUrl: parsedEnv.data.WS_URL,
  env: parsedEnv.data.ENV,
  jitoBlockEngineUrl: parsedEnv.data.JITO_BLOCK_ENGINE_URL
}

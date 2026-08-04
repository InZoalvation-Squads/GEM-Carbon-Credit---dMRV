import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  STORAGE_DIR: z.string().min(1).default('./storage'),
  DEMO_SEED_PASSWORD: z.string().min(1).optional(),
  // Hedera anchoring — all three must be present for real HCS writes;
  // otherwise the server falls back to the deterministic simulator.
  HEDERA_NETWORK: z.enum(['mainnet', 'testnet', 'previewnet']).default('testnet'),
  // Kubo node HTTP API for real CID pinning; absent → simulated CIDs.
  IPFS_API_URL: z.string().url().optional(),
  HEDERA_OPERATOR_ID: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  HEDERA_OPERATOR_KEY: z.string().min(64).optional(),
  // Hedera Guardian policy integration — all present → registered PDDs also
  // flow through the published Guardian policy (submit as PP, approve as SR).
  GUARDIAN_API_URL: z.string().url().optional(),
  GUARDIAN_POLICY_ID: z.string().min(1).optional(),
  GUARDIAN_PP_USERNAME: z.string().min(1).optional(),
  GUARDIAN_PP_PASSWORD: z.string().min(1).optional(),
  GUARDIAN_SR_USERNAME: z.string().min(1).optional(),
  GUARDIAN_SR_PASSWORD: z.string().min(1).optional(),
  // Hedera EVM (JSON-RPC relay) + the deployed GemCarbonCredit1155 contract —
  // both present →every mint also issues an ERC-1155 batch (id per credential).
  EVM_RPC_URL: z.string().url().optional(),
  ERC1155_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  // External IoT Postgres ingest — IOT_DB_URL + IOT_DEVICE_MAP present →
  // scheduled worker pulls readings into monitoring records (lib/iot.ts).
  IOT_DB_URL: z.string().min(1).optional(),
  IOT_DB_TABLE: z.string().min(1).optional(),
  IOT_COL_TIMESTAMP: z.string().min(1).optional(),
  IOT_COL_DEVICE_ID: z.string().min(1).optional(),
  IOT_COL_VALUE: z.string().min(1).optional(),
  IOT_VALUE_UNIT: z.enum(['kWh', 'Wh', 'MWh']).optional(),
  IOT_VALUE_KIND: z.enum(['interval', 'cumulative']).optional(),
  IOT_DEVICE_MAP: z.string().min(1).optional(),
  IOT_POLL_CRON: z.string().min(1).optional(),
  IOT_LOOKBACK_HOURS: z.coerce.number().positive().optional(),
  IOT_TIMEZONE: z.string().min(1).optional(),
  IOT_DEDUCTION_PCT: z.coerce.number().min(0).max(100).optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

export const config = loadConfig();

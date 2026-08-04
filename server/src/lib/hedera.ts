// Real Hedera HCS anchoring. The server is the only holder of the operator
// key, so all on-chain writes happen here — the browser signs credentials but
// never touches Hedera. When the operator env vars are absent (tests, dev
// without a funded account) callers fall back to the guardian-sim values.
//
// Testnet gRPC is flaky from some networks (DEADLINE_EXCEEDED after the SDK's
// own retries) — anchorToTopic therefore retries the whole transaction a few
// times before giving up.
import {
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenType,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { config } from '../config.js';

export interface HederaEnv {
  HEDERA_OPERATOR_ID?: string;
  HEDERA_OPERATOR_KEY?: string;
}

export function hederaEnabled(env?: HederaEnv): boolean {
  if (env === undefined) {
    // Vitest sets NODE_ENV=test; module tests must never hit the live network
    // even when the developer's .env carries a funded operator. Tests that
    // exercise anchoring mock this module (or pass an explicit env here).
    if (process.env.NODE_ENV === 'test') return false;
    env = config;
  }
  return Boolean(env.HEDERA_OPERATOR_ID && env.HEDERA_OPERATOR_KEY);
}

// HashScan has no per-message route — /topic/{id}/message/{n} renders "page
// not found". Link the topic page; the sequence number lives in the data.
export function hashscanTopicUrl(network: string, topicId: string): string {
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

/** Compact anchor payload written to HCS. Keep well under the 1024-byte chunk size. */
export interface AnchorMessage {
  v: 1;
  // 'project_listed' mirrors Verra's pipeline listing: the project gets its
  // public registry identity (the topic) when the PDD enters validation,
  // before Gate-1 approval. The later kinds all carry a credential.
  kind: 'project_listed' | 'pdd_registration' | 'verification_approval' | 'token_mint';
  credential_id?: string;
  package_hash?: string;
  project_id: string;
  pdd_id?: string;
  ipfs_cid?: string;
}

export function anchorMessageBytes(msg: AnchorMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export interface AnchorReceipt {
  topic_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  explorer_url: string;
}

let client: Client | null = null;

function getClient(): Client {
  if (client) return client;
  const c = Client.forName(config.HEDERA_NETWORK);
  c.setOperator(config.HEDERA_OPERATOR_ID!, PrivateKey.fromStringDer(config.HEDERA_OPERATOR_KEY!));
  client = c;
  return c;
}

/** For tests: drop the cached client so a fresh one picks up stubbed config. */
export function resetClient(): void {
  client?.close();
  client = null;
}

const ATTEMPTS = 3;

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(`${label} failed after ${ATTEMPTS} attempts: ${String(lastErr)}`);
}

/** Create a real HCS topic for a project. Memo makes topics identifiable on HashScan. */
export async function createProjectTopic(projectId: string): Promise<string> {
  return withRetries('TopicCreate', async () => {
    const resp = await new TopicCreateTransaction()
      .setTopicMemo(`gem-dmrv:${projectId}`)
      .execute(getClient());
    const receipt = await resp.getReceipt(getClient());
    if (!receipt.topicId) throw new Error('TopicCreate returned no topicId');
    return receipt.topicId.toString();
  });
}

/**
 * Create the platform's VCU credit token — an HTS NFT class (one serial per
 * anchored credential, Guardian-style). Treasury + supply key = operator.
 * Called once; the token id is persisted in app_state by the caller.
 */
export async function createVcuToken(): Promise<string> {
  return withRetries('TokenCreate', async () => {
    const operatorKey = PrivateKey.fromStringDer(config.HEDERA_OPERATOR_KEY!);
    const resp = await new TokenCreateTransaction()
      .setTokenName('GEM Verified Carbon Unit')
      .setTokenSymbol('GEMVCU')
      .setTokenType(TokenType.NonFungibleUnique)
      .setTreasuryAccountId(config.HEDERA_OPERATOR_ID!)
      .setSupplyKey(operatorKey.publicKey)
      .setTokenMemo('gem-dmrv VCU credits')
      .execute(getClient());
    const receipt = await resp.getReceipt(getClient());
    if (!receipt.tokenId) throw new Error('TokenCreate returned no tokenId');
    return receipt.tokenId.toString();
  });
}

/** Mint one VCU serial carrying the credential id as on-chain NFT metadata (≤100 bytes). */
export async function mintVcuNft(tokenId: string, metadata: string): Promise<number> {
  return withRetries('TokenMint', async () => {
    const resp = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .setMetadata([new TextEncoder().encode(metadata.slice(0, 100))])
      .execute(getClient());
    const receipt = await resp.getReceipt(getClient());
    const serial = receipt.serials[0];
    if (serial === undefined) throw new Error('TokenMint returned no serial');
    return Number(serial);
  });
}

/** Truncate to the HTS 100-BYTE limit without splitting a UTF-8 character (Thai chars are 3 bytes). */
export function fitHtsString(value: string, maxBytes = 100): string {
  const enc = new TextEncoder();
  let out = value;
  while (enc.encode(out).length > maxBytes) out = out.slice(0, -1);
  return out;
}

/**
 * Verra-style credit ledger, ONE fungible HTS token PER PROJECT: the token
 * NAME is the project name, 2 decimals (1.00 = 1 tCO2e). Each issuance mints
 * a batch on the project's own token; the receipt's total supply yields the
 * contiguous serial range — per-project serial books, like a registry.
 */
export async function createProjectFungibleToken(projectId: string, projectName: string): Promise<string> {
  return withRetries('TokenCreate', async () => {
    const operatorKey = PrivateKey.fromStringDer(config.HEDERA_OPERATOR_KEY!);
    const resp = await new TokenCreateTransaction()
      .setTokenName(fitHtsString(projectName))
      .setTokenSymbol('GVCU')
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(2)
      .setInitialSupply(0)
      .setTreasuryAccountId(config.HEDERA_OPERATOR_ID!)
      .setSupplyKey(operatorKey.publicKey)
      .setTokenMemo(fitHtsString(`gem-dmrv:${projectId} (1.00 = 1 tCO2e)`))
      .execute(getClient());
    const receipt = await resp.getReceipt(getClient());
    if (!receipt.tokenId) throw new Error('TokenCreate returned no tokenId');
    return receipt.tokenId.toString();
  });
}

export interface VcuBatchRange {
  /** first unit serial of this batch (1-based, in 0.01-tCO2e units) */
  serial_start: number;
  /** last unit serial of this batch */
  serial_end: number;
  /** units minted (amount_tco2e × 100) */
  units: number;
}

/** Mint a fungible batch; the receipt's new total supply yields the serial range. */
export async function mintVcuBatch(tokenId: string, units: number): Promise<VcuBatchRange> {
  return withRetries('TokenMint', async () => {
    const resp = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(units)
      .execute(getClient());
    const receipt = await resp.getReceipt(getClient());
    const supply = Number(receipt.totalSupply);
    return { serial_start: supply - units + 1, serial_end: supply, units };
  });
}

/** Submit one anchor message; resolves with the real consensus coordinates. */
export async function anchorToTopic(topicId: string, msg: AnchorMessage): Promise<AnchorReceipt> {
  return withRetries('TopicMessageSubmit', async () => {
    const resp = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(anchorMessageBytes(msg))
      .execute(getClient());
    const record = await resp.getRecord(getClient());
    const seq = record.receipt.topicSequenceNumber;
    if (seq === null) throw new Error('TopicMessageSubmit returned no sequence number');
    return {
      topic_id: topicId,
      sequence_number: Number(seq),
      consensus_timestamp: (record.consensusTimestamp?.toDate() ?? new Date()).toISOString(),
      explorer_url: hashscanTopicUrl(config.HEDERA_NETWORK, topicId),
    };
  });
}

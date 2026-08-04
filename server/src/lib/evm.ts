// ERC-1155 side of credit issuance, on the Hedera EVM (JSON-RPC relay).
// Each issuance batch = one token id on GemCarbonCredit1155; supply = whole
// tCO2e; batchRef stores the credential id for on-chain provenance. The same
// operator account signs — its secp256k1 DER key doubles as the EVM key.
import { ethers } from 'ethers';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

export function evmEnabled(env?: { EVM_RPC_URL?: string; ERC1155_ADDRESS?: string; HEDERA_OPERATOR_KEY?: string }): boolean {
  if (env === undefined) {
    if (process.env.NODE_ENV === 'test') return false; // tests mock this module
    env = config;
  }
  return Boolean(env.EVM_RPC_URL && env.ERC1155_ADDRESS && env.HEDERA_OPERATOR_KEY);
}

/** secp256k1 DER (3030…0420 ‖ key) → 0x-prefixed raw 32-byte private key. */
export function rawKeyFromDer(der: string): string {
  if (!/^[0-9a-fA-F]{96,}$/.test(der)) throw new Error('not a hex DER key');
  return `0x${der.slice(-64)}`;
}

const ABI_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'contracts', 'GemCarbonCredit1155.json');

let cached: ethers.Contract | null = null;

function contract(): ethers.Contract {
  if (cached) return cached;
  const provider = new ethers.JsonRpcProvider(config.EVM_RPC_URL);
  const wallet = new ethers.Wallet(rawKeyFromDer(config.HEDERA_OPERATOR_KEY!), provider);
  const { abi } = JSON.parse(readFileSync(ABI_PATH, 'utf8')) as { abi: ethers.InterfaceAbi };
  cached = new ethers.Contract(config.ERC1155_ADDRESS!, abi, wallet);
  return cached;
}

export interface Erc1155Mint {
  address: string;
  id: number;
  amount: number;
  tx_hash: string;
}

/** Mint one ERC-1155 batch to the operator (treasury); reverts if id exists. */
export async function mintErc1155Batch(id: number, amountTco2e: number, credentialId: string): Promise<Erc1155Mint> {
  const c = contract();
  const to = (c.runner as ethers.Wallet).address;
  const tx = await c.getFunction('mintBatch')(to, id, amountTco2e, credentialId, { gasLimit: 400_000 });
  const receipt = await tx.wait();
  return {
    address: config.ERC1155_ADDRESS!,
    id,
    amount: amountTco2e,
    tx_hash: receipt.hash,
  };
}

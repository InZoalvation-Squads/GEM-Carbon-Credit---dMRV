import { describe, it, expect } from 'vitest';
import { evmEnabled, rawKeyFromDer } from './evm.js';

describe('evmEnabled', () => {
  it('requires rpc url, contract address and operator key (off under NODE_ENV=test by default)', () => {
    expect(evmEnabled()).toBe(false);
    const full = { EVM_RPC_URL: 'http://r', ERC1155_ADDRESS: '0x' + 'a'.repeat(40), HEDERA_OPERATOR_KEY: 'k'.repeat(96) };
    expect(evmEnabled(full)).toBe(true);
    expect(evmEnabled({ ...full, ERC1155_ADDRESS: undefined })).toBe(false);
  });
});

describe('rawKeyFromDer', () => {
  it('extracts the trailing 32 bytes of a secp256k1 DER key', () => {
    const raw = '905035f5310354f68d6534d672975f910839967f74567d874be5a5f8171fe98e';
    expect(rawKeyFromDer('3030020100300706052b8104000a04220420' + raw)).toBe('0x' + raw);
  });
  it('rejects non-hex input', () => {
    expect(() => rawKeyFromDer('not-a-key')).toThrow();
  });
});

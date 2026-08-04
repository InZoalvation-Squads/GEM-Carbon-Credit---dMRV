// Deploy GemCarbonCredit1155 to the Hedera testnet EVM (via Hashio relay)
// and print the address. Run once; the server reads the address from .env.
import { ethers } from 'ethers';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

const RPC = process.env.EVM_RPC_URL ?? 'https://testnet.hashio.io/api';
const der = process.env.HEDERA_OPERATOR_KEY;
const raw = '0x' + der.slice(-64); // secp256k1 DER → last 32 bytes
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(raw, provider);
const { abi, bytecode } = JSON.parse(readFileSync('contracts/GemCarbonCredit1155.json', 'utf8'));

console.log('deploying from', wallet.address, '…');
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy('https://gem-dmrv.example/credit/{id}.json', { gasLimit: 3_000_000 });
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log('✅ GemCarbonCredit1155 deployed at', address);
console.log('   tx:', contract.deploymentTransaction().hash);

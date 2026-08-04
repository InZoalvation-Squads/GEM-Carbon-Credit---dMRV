// Live end-to-end Hedera anchor test against the running dev stack.
//
//   node scripts/live-anchor-test.mjs
//
// Walks the full Gate-1 flow over HTTP (create project → PDD → submit →
// validate → register), signs the Registration VC exactly like the browser
// (Ed25519 over sha256(canonical(vc sans proof/anchor))), posts it, and then
// verifies the REAL HCS message via the public mirror node.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';

const API = 'http://localhost:4000/api/v1';
const MIRROR = 'https://testnet.mirrornode.hedera.com';

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// --- canonical JSON + signing, verbatim semantics of carbon-ready/src/lib ---
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
const sha256Hex = (s) => bytesToHex(sha256(new TextEncoder().encode(s)));

function makeIssuer() {
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  const multicodec = new Uint8Array(2 + pub.length);
  multicodec.set([0xed, 0x01]);
  multicodec.set(pub, 2);
  return { did: `did:key:z${base58.encode(multicodec)}`, priv };
}

function signVc(vc, issuer) {
  const prepared = {
    ...vc,
    context: ['https://www.w3.org/ns/credentials/v2'],
    vc_type: vc.vc_type ?? ['VerifiableCredential'],
    issuer_did: issuer.did,
  };
  const { proof: _p, anchor: _a, ...unsigned } = prepared;
  const digest = sha256Hex(canonical(unsigned));
  const sig = ed25519.sign(Buffer.from(digest, 'hex'), issuer.priv);
  return {
    ...prepared,
    proof: {
      type: 'Ed25519Signature2020',
      created: prepared.issued_at,
      verificationMethod: issuer.did,
      proofValue: bytesToHex(sig),
    },
  };
}

const SOLAR_SECTION_DATA = {
  project_title_th: 'โครงการทดสอบ anchor บน Hedera จริง',
  project_title_en: 'Live Hedera Anchor Test',
  project_owner: 'GEM Carbon',
  project_scale: 'เล็กมาก', crediting_years: '7', crediting_start: '2026-01-01',
  preparer_name: 'Live Test', coordinator_name: 'Live Test',
  registered_elsewhere: 'ไม่มี', degradation_pct: 0.4,
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by on-site solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Live-stack anchor test.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Meter', monitoring_frequency: 'Monthly',
  qaqc_procedure: 'Live-stack anchor test.',
};

const owner = (await call('POST', '/auth/login', null, { email: 'proponent@gem.demo', password: 'demo1234' })).access_token;
const vvb = (await call('POST', '/auth/login', null, { email: 'vvb@gem.demo', password: 'demo1234' })).access_token;
console.log('✅ logged in (proponent + vvb)');

const stamp = new Date().toISOString().slice(0, 16);
const { project } = await call('POST', '/projects', owner, {
  name: `Hedera Live Anchor ${stamp}`, location: 'Chom Bueng, Ratchaburi, Thailand',
  capacity_kwp: 667.2, commission_date: '2025-12-01', status: 'active',
});
console.log('✅ project', project.id);

const { pdd } = await call('POST', `/projects/${project.id}/pdd`, owner, { methodology_id: 'meth-tver-solar' });
await call('PUT', `/pdds/${pdd.id}/draft`, owner, { section_data: SOLAR_SECTION_DATA, evidence_ids: [] });
await call('POST', `/pdds/${pdd.id}/submit`, owner);
await call('POST', `/pdds/${pdd.id}/start-validation`, vvb);
const reg = await call('POST', `/pdds/${pdd.id}/register`, vvb);
console.log('✅ registered:', reg.pdd.content_hash, '·', reg.pdd.ipfs_cid);
console.log('✅ guardian_ref:', JSON.stringify(reg.pdd.guardian_ref));
const gemvcuBefore = Number((await (await fetch(`${MIRROR}/api/v1/tokens/0.0.9909017`)).json()).total_supply ?? 0);

const issuer = makeIssuer();
const vc = signVc({
  id: `urn:vc:${sha256Hex(`${reg.pdd.content_hash}|${Date.now()}`).slice(0, 24)}`,
  schema_id: 'pdd-registration-v1',
  issuer_did: issuer.did,
  issued_at: reg.pdd.validated_at,
  subject: { pdd_id: pdd.id, project_id: project.id, ipfs_cid: reg.pdd.ipfs_cid, ...reg.disclosure },
  package_hash: reg.pdd.content_hash,
  hcs: { topic_id: '0.0.480100', sequence_number: 1, consensus_timestamp: reg.pdd.validated_at, explorer_url: 'sim' },
  vc_type: ['VerifiableCredential', 'PddRegistration'],
}, issuer);

console.log('⛓  posting signed VC (server will create the topic + submit the HCS message — takes a few seconds)…');
const anchored = await call('POST', `/pdds/${pdd.id}/credential`, vvb, vc);
const anchor = anchored.credential.anchor;
if (!anchor) {
  console.error('❌ credential stored but anchor is null — check server logs, then POST /credentials/:id/anchor to retry');
  process.exit(1);
}
console.log('✅ REAL anchor:', JSON.stringify(anchor, null, 2));
// Guardian approval fired at the credential-anchor step — poll for the policy mint
if (reg.pdd.guardian_ref) {
  let minted = false;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const supply = Number((await (await fetch(`${MIRROR}/api/v1/tokens/0.0.9909017`)).json()).total_supply ?? 0);
    if (supply > gemvcuBefore) {
      console.log(`✅ GUARDIAN POLICY MINT: GEMVCU supply ${gemvcuBefore} → ${supply}`);
      minted = true; break;
    }
  }
  if (!minted) console.log('⚠️ Guardian mint not observed yet (policy flow is async — check Guardian UI / mirror later)');
  const pddNow = await call('GET', `/pdds?state=registered`, vvb);
  const mine = (pddNow.pdds ?? []).find((p) => p.id === pdd.id);
  console.log('✅ guardian_ref after approve:', JSON.stringify(mine?.guardian_ref));
}

// --- IPFS: the registered CID must be REAL — fetch it back and re-hash ---
const gw = await fetch(`http://127.0.0.1:8080/ipfs/${reg.pdd.ipfs_cid}`, { signal: AbortSignal.timeout(15000) });
if (gw.ok) {
  const pinned = Buffer.from(await gw.arrayBuffer());
  const rehash = `sha256-${bytesToHex(sha256(pinned))}`;
  if (rehash === reg.pdd.content_hash) console.log('✅ IPFS CID is real — pinned bytes re-hash to content_hash');
  else console.log('❌ IPFS bytes do not match content_hash', rehash);
} else {
  console.log('⚠️ IPFS gateway fetch failed', gw.status);
}

// --- Verification package → approve → anchor MRV VC ---
const registry = (await call('POST', '/auth/login', null, { email: 'registry@gem.demo', password: 'demo1234' })).access_token;
const { verification: ver } = await call('POST', '/verifications', owner, {
  project_id: project.id, monitoring_period_start: '2026-01-01', monitoring_period_end: '2026-06-30',
  reduction_kgco2e: 443_000, factors_snapshot: 'TH grid EF 0.4682 tCO2/MWh (TGO 2568)', evidence_ids: [],
});
await call('POST', `/verifications/${ver.id}/submit`, owner);
await call('POST', `/verifications/${ver.id}/start-review`, vvb);
const approved = (await call('POST', `/verifications/${ver.id}/approve`, vvb, { note: 'live test' })).verification;
console.log('✅ verification approved, hash', approved.hash_value);

const mrvVc = signVc({
  id: `urn:vc:${sha256Hex(`${approved.hash_value}|mrv|${Date.now()}`).slice(0, 24)}`,
  schema_id: 'mrv-approval-v1',
  issuer_did: issuer.did,
  issued_at: new Date().toISOString(),
  subject: { verification_id: ver.id, project_id: project.id, reduction_tco2e: 443 },
  package_hash: approved.hash_value,
  hcs: { topic_id: '0.0.480100', sequence_number: 2, consensus_timestamp: new Date().toISOString(), explorer_url: 'sim' },
  vc_type: ['VerifiableCredential', 'MrvApproval'],
}, issuer);
const mrvAnchored = await call('POST', `/verifications/${ver.id}/anchor`, vvb, mrvVc);
console.log('✅ MRV credential anchored:', JSON.stringify(mrvAnchored.credential.anchor));

// --- Mint: server replaces sim token/serial with a REAL HTS NFT ---
const now = new Date().toISOString();
const minted = await call('POST', `/credentials/${encodeURIComponent(mrvVc.id)}/mint`, registry, {
  id: `token:sim:${Date.now()}`, token_id: '0.0.480200', serial_number: 1,
  project_id: project.id, credential_id: mrvVc.id, amount_tco2e: 443,
  monitoring_period_start: '2026-01-01', monitoring_period_end: '2026-06-30',
  minted_at: now, minted_by_role: 'admin',
  hcs: { topic_id: '0.0.480100', sequence_number: 3, explorer_url: 'sim' },
});
console.log('✅ REAL HTS batch mint:', minted.token.token_id, 'batch #' + minted.token.serial_number);
console.log('   serial range:', JSON.stringify(minted.token.batch));

// --- Mirror node confirms everything (propagation can lag) ---
await new Promise((r) => setTimeout(r, 9000));
const mm = await (await fetch(`${MIRROR}/api/v1/topics/${anchor.topic_id}/messages`)).json();
for (const m of mm.messages ?? []) {
  const decoded = JSON.parse(Buffer.from(m.message, 'base64').toString('utf8'));
  console.log(`✅ on-chain msg #${m.sequence_number}:`, decoded.kind, decoded.package_hash?.slice(0, 20) + '…');
}
const tokenInfo = await (await fetch(`${MIRROR}/api/v1/tokens/${minted.token.token_id}`)).json();
console.log('✅ mirror node FT:', tokenInfo.token_id, `"${tokenInfo.name}"`, `(${tokenInfo.symbol})`, 'supply', Number(tokenInfo.total_supply)/100, 'tCO2e');
console.log(tokenInfo.name.startsWith('Hedera Live Anchor') ? '✅ token NAME = project name' : '❌ token name mismatch: ' + tokenInfo.name);
console.log('🔗 topic:', anchor.explorer_url);
console.log('🔗 token:', `https://hashscan.io/testnet/token/${minted.token.token_id}`);

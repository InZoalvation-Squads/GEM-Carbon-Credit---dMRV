// Copied from carbon-ready/src/lib/guardian.ts (pure stand-ins only) — source
// of truth until workspaces (Phase 1b). Only the two deterministic Guardian
// simulators the register step needs are ported; VC issuing/minting stays in
// the browser (Task 8 stores the browser-signed objects). Bodies are verbatim.

// Guardian creates one HCS topic per project under the policy topic. Simulated as a
// deterministic id in the 0.0.481000–0.0.481999 range so re-derivation is stable.
export function projectTopicId(projectId: string): string {
  let digest = 0;
  for (let i = 0; i < projectId.length; i++) digest = (Math.imul(digest, 31) + projectId.charCodeAt(i)) >>> 0;
  return `0.0.${481000 + (digest % 1000)}`;
}

// Deterministic stand-in for the IPFS CID Guardian records after uploading the
// signed PDD document. Derived from the content hash so re-registration of the
// same frozen payload yields the same CID.
export function toIpfsCid(contentHash: string): string {
  const hex = contentHash.replace('sha256-', '');
  return `bafkrei${hex.padEnd(20, '0').slice(0, 20)}`;
}

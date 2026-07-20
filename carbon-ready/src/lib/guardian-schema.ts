import type { CredentialSchema } from '../types';

// W3C Verifiable-Credential-style schema for an MRV carbon-reduction approval.
// In a real Guardian deployment this would be a published schema bound to a policy.
export const MRV_APPROVAL_SCHEMA_V1: CredentialSchema = {
  id: 'mrv-approval-v1',
  name: 'MRV Carbon Reduction Approval',
  version: '1.0.0',
  type: 'VerifiableCredential',
  properties: [
    { key: 'verification_id', type: 'string', description: 'Verification package id' },
    { key: 'project_id', type: 'string', description: 'Project id' },
    { key: 'monitoring_period_start', type: 'date', description: 'Monitoring period start (ISO date)' },
    { key: 'monitoring_period_end', type: 'date', description: 'Monitoring period end (ISO date)' },
    { key: 'reduction_tco2e', type: 'number', description: 'Verified carbon reduction (tCO2e)' },
    { key: 'factors_snapshot', type: 'string', description: 'Emission factor snapshot used' },
    { key: 'evidence', type: 'array', description: 'Evidence items as {id, content_hash}' },
    { key: 'approval_role', type: 'string', description: 'Role that approved the package' },
    { key: 'approved_at', type: 'date', description: 'Approval (lock) timestamp' },
    { key: 'package_hash', type: 'string', description: 'Hash of the approved package' },
  ],
};

// Schema for the credential issued when a PDD passes validation and the project
// is registered. The full PDD stays off-chain; this VC carries hash + CID.
export const PDD_REGISTRATION_SCHEMA_V1: CredentialSchema = {
  id: 'pdd-registration-v1',
  name: 'PDD Project Registration',
  version: '1.0.0',
  type: 'VerifiableCredential',
  properties: [
    { key: 'pdd_id', type: 'string', description: 'Project Design Document id' },
    { key: 'project_id', type: 'string', description: 'Project id' },
    { key: 'methodology', type: 'string', description: 'Methodology code + version snapshot' },
    { key: 'content_hash', type: 'string', description: 'Hash of the frozen PDD payload' },
    { key: 'ipfs_cid', type: 'string', description: 'IPFS CID of the published PDD document' },
    { key: 'evidence', type: 'array', description: 'Evidence items as {id, content_hash}' },
    { key: 'registered_at', type: 'date', description: 'Registration timestamp' },
    { key: 'disclosed', type: 'object', description: 'Public PDD fields (selective disclosure)' },
    { key: 'redacted', type: 'array', description: 'Sensitive fields as {key, value_hash}' },
  ],
};

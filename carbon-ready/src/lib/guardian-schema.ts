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

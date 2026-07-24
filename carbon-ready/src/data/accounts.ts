import type { User } from '../types';

// Mock demo accounts, one per role — mapped onto the Guardian VM0047 actor triad.
// All share a single demo password. There is no real auth backend.
export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS: User[] = [
  { id: 'usr-proponent', email: 'proponent@gem.demo', name: 'Asha Iyer',    role: 'project_owner', created_at: '2025-01-01T00:00:00Z' },
  { id: 'usr-vvb',       email: 'vvb@gem.demo',       name: 'Daniel Okoye', role: 'verifier',      created_at: '2025-01-01T00:00:00Z' },
  { id: 'usr-registry',  email: 'registry@gem.demo',  name: 'Verra Registry', role: 'admin',       created_at: '2025-01-01T00:00:00Z' },
  { id: 'usr-esg',       email: 'esg@gem.demo',       name: 'Mia Chen',     role: 'esg_manager',   created_at: '2025-01-01T00:00:00Z' },
];

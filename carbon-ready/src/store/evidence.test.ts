import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { sha256HexBytes } from '../lib/hash';
import { seedDemo } from '../test/demoFixtures';

describe('evidence content hashing', () => {
  beforeEach(() => {
    localStorage.clear();
    seedDemo();
  });

  // 'prj-0001' is the seeded Pune Rooftop Phase 1 project from demoFixtures.
  it('uses the caller-supplied byte hash when provided', () => {
    const bytes = new TextEncoder().encode('meter,2026-01-01,1234');
    const digest = `sha256-${sha256HexBytes(bytes)}`;
    const ev = useStore.getState().uploadEvidence('prj-0001', {
      file_name: 'jan.xlsx', kind: 'xlsx', file_size: bytes.length,
      category: 'meter_reading', content_hash: digest,
    });
    expect(ev.content_hash).toBe(digest);
  });

  it('falls back to metadata hash when bytes are unavailable', () => {
    const ev = useStore.getState().uploadEvidence('prj-0001', {
      file_name: 'a.pdf', kind: 'pdf', file_size: 10, category: 'site_photo',
    });
    expect(ev.content_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it('replaceEvidence honours a caller-supplied byte hash', () => {
    const base = useStore.getState().uploadEvidence('prj-0001', {
      file_name: 'log.xlsx', kind: 'xlsx', file_size: 20, category: 'maintenance_report',
    });
    const bytes = new TextEncoder().encode('inverter,2026-02-01,999');
    const digest = `sha256-${sha256HexBytes(bytes)}`;
    const next = useStore.getState().replaceEvidence(base.id, {
      file_name: 'log-v2.xlsx', file_size: bytes.length, content_hash: digest,
    });
    expect(next?.content_hash).toBe(digest);
    expect(next?.version_number).toBe(2);
  });
});

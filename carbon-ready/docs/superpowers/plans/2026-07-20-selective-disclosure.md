# Selective Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDD credentials publish public fields in the clear and sensitive fields as content hashes; the document view marks restricted fields and offers a public-view mode.

**Architecture:** A `sensitive` flag on the field schema + a pure `splitDisclosure()` in the PDD lib; `buildPddSubject()` embeds the split; `registerProject()` wires it. `PddDocument` gets a chip + toggle.

**Tech Stack:** TypeScript, zustand, vitest + @testing-library/react.

**Spec:** `carbon-ready/docs/superpowers/specs/2026-07-20-selective-disclosure-design.md`

All commands run from `carbon-ready/`.

---

### Task 1: `sensitive` flag + `splitDisclosure()`

**Files:**
- Modify: `carbon-ready/src/types/index.ts` (PddFieldSchema ~line 291)
- Modify: `carbon-ready/src/data/methodologies/shared.ts` (stdAdditionalitySection)
- Modify: `carbon-ready/src/data/methodology-tver-solar.ts` (same two fields)
- Modify: `carbon-ready/src/lib/pdd.ts`
- Test: `carbon-ready/src/lib/pdd.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `carbon-ready/src/lib/pdd.test.ts` (import `splitDisclosure` from `./pdd`,
`shortHash`, `canonical` from `./hash`, and a `Methodology` type import if not present):

```ts
describe('splitDisclosure', () => {
  const m = {
    pdd_sections: [{
      key: 's1', title: 'S1',
      fields: [
        { key: 'technology', label: 'Tech', type: 'text', required: true },
        { key: 'barrier_explanation', label: 'Barrier', type: 'textarea', required: true, sensitive: true },
        { key: 'investment_metric', label: 'Metric', type: 'select', required: true, sensitive: true, showIf: { field: 'barrier_type', equals: 'Investment' } },
        { key: 'grid_factor', label: 'GF', type: 'computed', source: 'grid_factor', required: false },
      ],
    }],
  } as unknown as Methodology;

  it('discloses public fields and redacts sensitive ones with a deterministic hash', () => {
    const data = { technology: 'Solar PV', barrier_explanation: 'IRR below hurdle rate', barrier_type: 'Technological' };
    const r = splitDisclosure(m, data);
    expect(r.disclosed.technology).toBe('Solar PV');
    expect(r.disclosed.barrier_explanation).toBeUndefined();
    expect(r.redacted).toEqual([{ key: 'barrier_explanation', value_hash: shortHash(canonical('IRR below hurdle rate')) }]);
  });

  it('a sensitive field hidden by showIf appears in neither list', () => {
    const data = { technology: 'Solar PV', barrier_explanation: 'x', barrier_type: 'Technological', investment_metric: 'IRR' };
    const r = splitDisclosure(m, data);
    expect(r.redacted.map((x) => x.key)).toEqual(['barrier_explanation']);
    expect(r.disclosed.investment_metric).toBeUndefined();
  });

  it('skips computed and empty fields', () => {
    const r = splitDisclosure(m, { technology: '', barrier_explanation: 'x' });
    expect(r.disclosed.technology).toBeUndefined();
    expect(r.disclosed.grid_factor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/pdd.test.ts`
Expected: FAIL — `splitDisclosure` not exported.

- [ ] **Step 3: Implement**

`carbon-ready/src/types/index.ts` — add to `PddFieldSchema` after `source?`:

```ts
  sensitive?: boolean;         // selective disclosure: published only as a hash
```

`carbon-ready/src/data/methodologies/shared.ts` and
`carbon-ready/src/data/methodology-tver-solar.ts` — add `sensitive: true` to the
`investment_metric` and `barrier_explanation` field literals (4 edits total).

`carbon-ready/src/lib/pdd.ts` — add (extend the existing `./hash` import with `shortHash` already imported; `canonical` too):

```ts
export interface DisclosureSplit {
  disclosed: Record<string, unknown>;
  redacted: Array<{ key: string; value_hash: string }>;
}

/** Guardian-style selective disclosure: sensitive fields leave only a content hash. */
export function splitDisclosure(m: Methodology, data: Record<string, unknown>): DisclosureSplit {
  const disclosed: Record<string, unknown> = {};
  const redacted: DisclosureSplit['redacted'] = [];
  for (const section of m.pdd_sections) {
    for (const field of section.fields) {
      if (field.type === 'computed') continue;
      if (!isFieldVisible(field, data)) continue;
      const v = data[field.key];
      if (v === undefined || v === null || v === '') continue;
      if (field.sensitive) redacted.push({ key: field.key, value_hash: shortHash(canonical(v)) });
      else disclosed[field.key] = v;
    }
  }
  redacted.sort((a, b) => a.key.localeCompare(b.key));
  return { disclosed, redacted };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- src/lib/pdd.test.ts && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/data/methodologies/shared.ts src/data/methodology-tver-solar.ts src/lib/pdd.ts src/lib/pdd.test.ts
git commit -m "feat(guardian): sensitive field flag + splitDisclosure"
```

---

### Task 2: Credential carries the disclosure split

**Files:**
- Modify: `carbon-ready/src/lib/guardian.ts` (buildPddSubject)
- Modify: `carbon-ready/src/store/index.ts` (registerProject)
- Modify: `carbon-ready/src/lib/guardian-schema.ts` (PDD schema properties)
- Test: `carbon-ready/src/lib/guardian.test.ts`, `carbon-ready/src/store/registration.test.ts`

- [ ] **Step 1: Write/extend the failing tests**

In `carbon-ready/src/lib/guardian.test.ts`, update the `buildPddSubject` test — pass a
4th argument and assert passthrough (existing call sites in the test get the new arg):

```ts
    const s = buildPddSubject(pdd, ev, 'bafkreicafe', { disclosed: { technology: 'Solar PV' }, redacted: [{ key: 'barrier_explanation', value_hash: 'sha256-xyz' }] });
    expect(s.disclosed).toEqual({ technology: 'Solar PV' });
    expect(s.redacted).toEqual([{ key: 'barrier_explanation', value_hash: 'sha256-xyz' }]);
```

In `carbon-ready/src/store/registration.test.ts`, extend the anchor test (the draft saved
there includes `barrier_explanation: 'x'` and `technology: 'Solar PV rooftop'`):

```ts
    const disclosed = vc.subject.disclosed as Record<string, unknown>;
    const redacted = vc.subject.redacted as Array<{ key: string; value_hash: string }>;
    expect(disclosed.technology).toBe('Solar PV rooftop');
    expect(disclosed.barrier_explanation).toBeUndefined();
    expect(redacted.map((r) => r.key)).toContain('barrier_explanation');
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/lib/guardian.test.ts src/store/registration.test.ts`
Expected: FAIL (subject has no disclosed/redacted; buildPddSubject takes 3 args).

- [ ] **Step 3: Implement**

`carbon-ready/src/lib/guardian.ts` — import `DisclosureSplit` from `./pdd`; change the
signature and returned subject:

```ts
export function buildPddSubject(pdd: ProjectDesignDocument, evidence: EvidenceFile[], ipfsCid: string, disclosure: DisclosureSplit): Record<string, unknown> {
  ...
  return {
    ...,           // existing keys unchanged
    disclosed: disclosure.disclosed,
    redacted: disclosure.redacted,
  };
}
```

`carbon-ready/src/store/index.ts` — in `registerProject`, import `splitDisclosure` from
`../lib/pdd` (extend existing import) and pass the split:

```ts
        const vc = issueCredential(
          buildPddSubject(frozen, get().evidence, ipfs_cid, splitDisclosure(m, pdd.section_data)),
          ...
        );
```

`carbon-ready/src/lib/guardian-schema.ts` — add to `PDD_REGISTRATION_SCHEMA_V1.properties`:

```ts
    { key: 'disclosed', type: 'object', description: 'Public PDD fields (selective disclosure)' },
    { key: 'redacted', type: 'array', description: 'Sensitive fields as {key, value_hash}' },
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/guardian.test.ts src/store/registration.test.ts && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardian.ts src/lib/guardian-schema.ts src/store/index.ts src/lib/guardian.test.ts src/store/registration.test.ts
git commit -m "feat(guardian): PDD credential publishes disclosed fields, hashes sensitive ones"
```

---

### Task 3: Restricted chip + Public view on the PDD document

**Files:**
- Modify: `carbon-ready/src/pages/PddDocument.tsx`
- Test: `carbon-ready/src/pages/pdddocument.ui.test.tsx` (new)

- [ ] **Step 1: Write the failing UI tests**

Create `carbon-ready/src/pages/pdddocument.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PddDocument } from './PddDocument';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

// PDD-2000 (solar, registered) carries barrier_explanation in its section data.
function renderDoc() {
  return render(<MemoryRouter><PddDocument pddId="PDD-2000" /></MemoryRouter>);
}

describe('PddDocument selective disclosure', () => {
  it('marks sensitive fields with a Restricted chip', () => {
    renderDoc();
    expect(screen.getAllByText(/Restricted/i).length).toBeGreaterThan(0);
  });

  it('Public view masks sensitive values', () => {
    renderDoc();
    const value = 'Rooftop space is unmonetised; solar adoption depends on carbon revenue.';
    expect(screen.getByText((t) => t.includes('carbon revenue'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Public view/i }));
    expect(screen.queryByText((t) => t.includes('carbon revenue'))).toBeNull();
    expect(screen.getAllByText('•••').length).toBeGreaterThan(0);
  });
});
```

Before finalizing, check `SOLAR_SECTION_DATA.barrier_explanation` in
`src/test/demoFixtures.ts` and use a distinctive substring of its actual value in the
`value`/matcher above.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/pages/pdddocument.ui.test.tsx`
Expected: FAIL (no chip, no toggle).

- [ ] **Step 3: Implement**

In `carbon-ready/src/pages/PddDocument.tsx`:
- `const [publicView, setPublicView] = useState(false);` (import `useState`, `Lock`, `Eye`/`EyeOff` from lucide).
- Toolbar (next to Print): `<Button variant="ghost" onClick={() => setPublicView((v) => !v)}>{publicView ? <EyeOff size={16} /> : <Eye size={16} />} Public view</Button>`.
- In the field render loop, for `f.sensitive`: chip beside the label —
  `<span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700"><Lock size={10} /> Restricted</span>`
  and value: `{f.sensitive && publicView ? '•••' : display(f.key, f.source)}`.

Follow the file's existing `dt`/`dd` idiom.

- [ ] **Step 4: Full suite + typecheck + build**

Run: `npm test && npx tsc -b && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PddDocument.tsx src/pages/pdddocument.ui.test.tsx
git commit -m "feat(guardian): restricted chip + public view on PDD document"
```

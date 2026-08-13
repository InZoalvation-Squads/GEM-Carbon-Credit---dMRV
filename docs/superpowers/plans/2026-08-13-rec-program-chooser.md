# REC Program Chooser + REC Registration Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Developers pick TGO (T-VER) or REC on the Register Project page; the REC track is a full registration flow driven by a new methodology-as-data document built from the official Evident SF-02 v1.3 form.

**Architecture:** Add `'REC'` to the `Standard` union (SPA types + server mirror + both zod enums, kept byte-identical for the copy-drift test). Ship a new methodology document `meth-rec-solar` (SPA TS literal + server seed JSON) whose `pdd_sections` map 1:1 to SF-02 sections. Insert a program-chooser step 0 in `Registration.tsx` before the methodology cards, and relabel "PDD" as "REC Registration" where the methodology's standard is `REC`. No DB migration; Project→Pdd is already 1:many.

**Tech Stack:** React 18 + Vite + Zustand + vitest/@testing-library (carbon-ready/), Fastify + Prisma + zod + vitest (server/).

**Spec:** `docs/superpowers/specs/2026-08-13-rec-program-chooser-design.md`
**Source documents:** `docs/reference/rec/sf-02-production-facility-registration-v1.3.pdf`, `docs/reference/rec/egat-irec-process-guide-v12.pdf`

**Critical constraints discovered in the codebase (read before starting):**

1. **Copy-drift test** (`server/src/lib/copy-drift.test.ts`): `server/src/lib/methodology-schema.ts` and `server/src/lib/methodology-types.ts` are copies of the SPA sources and must stay in sync modulo comments/imports. Always edit the SPA file first, then apply the identical change to the server copy. Never let the two `z.enum` / `type Standard` lines differ.
2. **`showIf` is strict string equality** (`carbon-ready/src/lib/pdd.ts:20`: `data[field.showIf.field] === field.showIf.equals`). Boolean fields store `true`/`false` and can never drive `showIf`. Yes/No questions that gate other fields MUST be `select` fields with string options (existing pattern: `registered_elsewhere` in `methodology-tver-solar.ts:95`).
3. **Seed count assertions**: `server/src/seed.test.ts` asserts exactly **9** methodologies in two places. Adding the 10th seed JSON without bumping those numbers breaks the server suite.
4. **Bundled-methodology parity test** (`carbon-ready/src/lib/methodology-schema.test.ts` — "accepts every bundled methodology") automatically zod-validates everything in `ALL_METHODOLOGIES`. Registering the REC doc there gives schema validation for free.
5. **Evidence categories are a closed enum** (7 values). The EGAT Process Guide checklist maps onto existing categories; the full document list lives in section help text, not new enum values.

---

### Task 1: Add `'REC'` to the Standard union (SPA + server copies)

**Files:**
- Modify: `carbon-ready/src/types/index.ts:352`
- Modify: `carbon-ready/src/lib/methodology-schema.ts:89`
- Modify: `server/src/lib/methodology-types.ts:70`
- Modify: `server/src/lib/methodology-schema.ts:94`
- Test: `carbon-ready/src/lib/methodology-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the top-level of `carbon-ready/src/lib/methodology-schema.test.ts` (import `parseMethodologyJson`, `methodologyToJson`, and `TVER_WIND_METHODOLOGY` are already available in the file — reuse whatever the existing tests import; if the file imports `ALL_METHODOLOGIES`, build the fixture from any bundled doc):

```ts
describe('schema v2 — REC standard', () => {
  it('accepts standard "REC"', () => {
    const doc = JSON.parse(methodologyToJson(ALL_METHODOLOGIES[0]));
    doc.standard = 'REC';
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.methodology.standard).toBe('REC');
  });
});
```

If `ALL_METHODOLOGIES` is not already imported in this test file, add it to the existing import from `'../data/methodologies'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/methodology-schema.test.ts`
Expected: FAIL — the new test reports `res.ok` false (zod enum rejects `'REC'`). All pre-existing tests still pass.

- [ ] **Step 3: Update the SPA type union**

In `carbon-ready/src/types/index.ts` line 352, change:

```ts
export type Standard = 'T-VER' | 'Verra' | 'CDM';
```

to:

```ts
export type Standard = 'T-VER' | 'Verra' | 'CDM' | 'REC';
```

- [ ] **Step 4: Update the SPA zod enum**

In `carbon-ready/src/lib/methodology-schema.ts` line 89, change:

```ts
  standard: z.enum(['T-VER', 'Verra', 'CDM']),
```

to:

```ts
  standard: z.enum(['T-VER', 'Verra', 'CDM', 'REC']),
```

- [ ] **Step 5: Apply the identical changes to the server copies**

In `server/src/lib/methodology-types.ts` line 70, change the `Standard` type line to exactly:

```ts
export type Standard = 'T-VER' | 'Verra' | 'CDM' | 'REC';
```

In `server/src/lib/methodology-schema.ts` line 94, change the enum line to exactly:

```ts
  standard: z.enum(['T-VER', 'Verra', 'CDM', 'REC']),
```

(Character-for-character the same as the SPA lines — the copy-drift test compares them whitespace-normalized.)

- [ ] **Step 6: Run SPA test to verify it passes**

Run: `cd carbon-ready && npx vitest run src/lib/methodology-schema.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Run the server copy-drift + schema tests**

Run: `cd server && npx vitest run src/lib/copy-drift.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add carbon-ready/src/types/index.ts carbon-ready/src/lib/methodology-schema.ts carbon-ready/src/lib/methodology-schema.test.ts server/src/lib/methodology-types.ts server/src/lib/methodology-schema.ts
git commit -m "feat(rec): add 'REC' to Standard union and zod enums (SPA + server mirror)"
```

---

### Task 2: REC methodology document (SPA data file)

**Files:**
- Create: `carbon-ready/src/data/methodologies/rec-solar.ts`
- Modify: `carbon-ready/src/data/methodologies/index.ts`
- Test: `carbon-ready/src/lib/methodology-schema.test.ts` (parity test covers it automatically) + one focused test

Field content transcribed from SF-02 v1.3 (see `docs/reference/rec/sf-02-production-facility-registration-v1.3.pdf`). SF-02 §1.8 (signature) and forms SF-02A/SF-02C are signed artifacts → handled as uploaded evidence, not form fields. SF-02B (Production Group) is out of scope.

- [ ] **Step 1: Write the failing focused test**

Append to `carbon-ready/src/lib/methodology-schema.test.ts`:

```ts
describe('REC production facility registration doc (SF-02)', () => {
  it('is bundled, standard REC, with the 7 SF-02 sections', () => {
    const rec = ALL_METHODOLOGIES.find((m) => m.id === 'meth-rec-solar');
    expect(rec).toBeDefined();
    expect(rec!.standard).toBe('REC');
    expect(rec!.code).toBe('SF-02');
    expect(rec!.pdd_sections.map((s) => s.key)).toEqual([
      'registration_info', 'registrant_contact', 'facility_details',
      'fuel_technology', 'business_details', 'verification_agent', 'additional_info',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/methodology-schema.test.ts`
Expected: FAIL — `rec` is undefined.

- [ ] **Step 3: Create the methodology data file**

Create `carbon-ready/src/data/methodologies/rec-solar.ts` with exactly:

```ts
import type { Methodology } from '../../types';

// I-REC(E) Production Facility Registration — transcribed from the official
// Evident form SF-02 v1.3 (07 Sep 2023) as submitted to EGAT, Thailand's
// I-REC(E) Local Issuer. Source: docs/reference/rec/. SF-02 §1.8 signature and
// declarations SF-02A/SF-02C are signed documents uploaded as evidence, not
// form fields. Fuel/Technology codes come from Evident SD-02 and are entered
// by the user — no codes are hard-coded here.
export const REC_SOLAR_METHODOLOGY: Methodology = {
  id: 'meth-rec-solar',
  code: 'SF-02',
  name: 'I-REC(E) Production Facility Registration (ขึ้นทะเบียนอุปกรณ์ผลิตไฟฟ้า REC)',
  standard: 'REC',
  version: 'v1.3',
  sectoral_scope: 'Renewable electricity generation',
  status: 'active',
  // Facility generation is metered in kWh; issuance (1 REC = 1 MWh) is out of
  // scope this round — grid_displacement keeps the SPA treating the track as a
  // powered (non-land-based) project so capacity prefill behaves normally.
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['site_photo', 'commissioning_report', 'meter_reading', 'supporting_evidence'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity produced by the facility', unit: 'kWh', method: 'Revenue-grade meter', frequency: 'Monthly' },
  ],
  pdd_sections: [
    {
      key: 'registration_info',
      title: '1. Registration / ข้อมูลการยื่น',
      help: 'เอกสารแนบตาม EGAT Process Guide V12 (อัปโหลดในหน้า Evidence): รูปถ่ายโครงการ, PPA, Meter Calibration Report (กรณีมิเตอร์ non-settlement), Single Line Diagram, หลักฐานปริมาณไฟที่ผลิต, หลักฐานกำลังติดตั้ง (kW), ใบอนุญาตผลิตไฟฟ้า (พค.2/ERC), หลักฐานวัน COD, SF-02A Registrant's Declaration และ SF-02C Owner's Declaration (กรณีผู้ยื่นไม่ใช่เจ้าของ), Declaration/Notice Letter (กรณีมี onsite consumer)',
      fields: [
        { key: 'registration_type', label: 'Registration type', type: 'select', options: ['New', 'Change of details'], required: true, defaultValue: 'New' },
        { key: 'registrant_is_owner', label: 'Is the Registrant also the owner of the Production Facility?', type: 'select', options: ['Yes', 'No'], required: true, help: 'ถ้า No — ต้องแนบ SF-02C Owner\'s Declaration พร้อมหลักฐานความเป็นเจ้าของ' },
      ],
    },
    {
      key: 'registrant_contact',
      title: '2. Registrant Contact Details',
      help: 'ข้อมูลองค์กรผู้ยื่น (Registrant) ตามบัญชีบน Evident Registry — สมัครบัญชีด้วยฟอร์ม SF-01 + STC Contract กับ EGAT นอกระบบนี้',
      fields: [
        { key: 'evident_org_id', label: 'Organisation ID/code', type: 'text', required: true, help: 'ตามที่แสดงบน Evident Registry' },
        { key: 'organisation_name', label: 'Organisation name', type: 'text', required: true },
        { key: 'contact_person', label: 'Contact person', type: 'text', required: true },
        { key: 'business_address', label: 'Business address', type: 'textarea', required: true, help: 'รวมรหัสไปรษณีย์' },
        { key: 'registrant_country', label: 'Country', type: 'text', required: true, defaultValue: 'Thailand' },
        { key: 'registrant_email', label: 'e-mail', type: 'email', required: true },
        { key: 'registrant_phone', label: 'Telephone', type: 'text', required: true },
      ],
    },
    {
      key: 'facility_details',
      title: '3. Production Facility Details',
      fields: [
        { key: 'project_location', label: 'Location (from project record)', type: 'computed', source: 'project_location', required: false },
        { key: 'project_capacity_kwp', label: 'Installed capacity (from project record)', type: 'computed', source: 'capacity_kwp', required: false },
        { key: 'commission_date', label: 'Commissioning date', type: 'computed', source: 'commission_date', required: false },
        { key: 'facility_name', label: 'Facility name', type: 'text', required: true, siteSpecific: true },
        { key: 'facility_address', label: 'Facility address', type: 'textarea', required: true, siteSpecific: true, help: 'ที่อยู่เต็มรวมรหัสไปรษณีย์' },
        { key: 'facility_country', label: 'Country', type: 'text', required: true, defaultValue: 'Thailand' },
        { key: 'latitude', label: 'Latitude', type: 'number', required: true, siteSpecific: true, help: '±n.nnnnnn (ทศนิยม 6 ตำแหน่ง)' },
        { key: 'longitude', label: 'Longitude', type: 'number', required: true, siteSpecific: true, help: '±n.nnnnnn (ทศนิยม 6 ตำแหน่ง)' },
        { key: 'installed_capacity_mw', label: 'Installed capacity', type: 'number', unit: 'MW', required: true, siteSpecific: true, help: 'สูงสุด 6 ตำแหน่งทศนิยม (kWp ÷ 1000)' },
        { key: 'meter_ids', label: 'Meter or Measurement ID(s)', type: 'text', required: true, siteSpecific: true },
        { key: 'generating_units', label: 'Number of generating units', type: 'number', required: true, siteSpecific: true },
        { key: 'network_owner_voltage', label: 'Owner of the network to which the Production Device is connected and the voltage of that connection', type: 'text', required: true, siteSpecific: true, help: 'เช่น PEA — 22 kV' },
        { key: 'non_grid_details', label: 'If the Production Device is not connected directly to the grid, specify the circumstances and additional relevant meter registration numbers', type: 'textarea', required: false, siteSpecific: true },
        { key: 'volume_evidence_form', label: 'Expected form of volume evidence', type: 'select', options: ['Metering data', 'Contract sales invoice', 'Other'], required: true, defaultValue: 'Metering data' },
        { key: 'volume_evidence_other', label: 'Volume evidence — other (please specify)', type: 'text', required: true, showIf: { field: 'volume_evidence_form', equals: 'Other' } },
      ],
    },
    {
      key: 'fuel_technology',
      title: '4. Removal Type and Code (Fuel & Technology)',
      help: 'รหัสตามเอกสาร Evident SD-02: Technologies and Fuels — โครงการ multi-fuel ให้ระบุทุก fuel',
      fields: [
        { key: 'fuel_code', label: 'Fuel — Code', type: 'text', required: true, help: 'ตาม SD-02' },
        { key: 'fuel_description', label: 'Fuel — Description', type: 'text', required: true },
        { key: 'technology_code', label: 'Technology — Code', type: 'text', required: true, help: 'ตาม SD-02' },
        { key: 'technology_description', label: 'Technology — Description', type: 'text', required: true },
      ],
    },
    {
      key: 'business_details',
      title: '5. Business Details',
      fields: [
        { key: 'onsite_consumer', label: 'Is there an on-site (captive) consumer present?', type: 'select', options: ['Yes', 'No'], required: true, siteSpecific: true, help: 'ถ้า Yes — ต้องแนบ Declaration Letter (ลงนามโดย consumer) หรือ Notice Letter (ลงนามโดยเจ้าของ) สละสิทธิ์การเคลม energy attributes' },
        { key: 'onsite_consumer_details', label: 'On-site consumer details', type: 'textarea', required: true, siteSpecific: true, showIf: { field: 'onsite_consumer', equals: 'Yes' } },
        { key: 'aux_energy_sources', label: 'Auxiliary/standby energy sources present?', type: 'select', options: ['Yes', 'No'], required: true, siteSpecific: true },
        { key: 'aux_energy_details', label: 'Auxiliary/standby energy source details', type: 'textarea', required: true, siteSpecific: true, showIf: { field: 'aux_energy_sources', equals: 'Yes' } },
        { key: 'import_routes', label: 'Details of how the site can import electricity by means other than through the meter(s) specified above', type: 'textarea', required: true, siteSpecific: true, help: 'ระบุ "None" หากไม่มี' },
        { key: 'other_schemes', label: 'Details (including registration id) of any carbon offset or energy tracking scheme for which the Production Facility is registered', type: 'textarea', required: true, siteSpecific: true, help: 'เช่น ทะเบียน T-VER ของโครงการนี้ — ระบุ "None" หากไม่มี' },
        { key: 'labelling_schemes', label: 'Labelling Scheme(s) for which the Production Facility is accredited', type: 'text', required: false, siteSpecific: true },
        { key: 'public_funding', label: 'Has the Production Facility ever received public (government) funding (e.g. Feed in Tariff)?', type: 'select', options: ['No', 'Investment', 'Production'], required: true, siteSpecific: true },
        { key: 'funding_end_date', label: 'If public funding has been received, when did/will it finish?', type: 'date', required: false, siteSpecific: true, help: 'กรอกเมื่อเลือก Investment หรือ Production' },
        { key: 'effective_reg_date', label: 'Requested effective date of registration', type: 'date', required: true, siteSpecific: true, help: 'ย้อนหลังได้ไม่เกิน 12 เดือนก่อนวันยื่นฟอร์ม' },
      ],
    },
    {
      key: 'verification_agent',
      title: '6. Verification Agent',
      fields: [
        { key: 'verification_agent_name', label: 'Name of proposed Verification Agent (if not the Issuer)', type: 'text', required: false },
      ],
    },
    {
      key: 'additional_info',
      title: '7. Additional Information',
      fields: [
        { key: 'additional_info', label: 'Any further information relevant to this registration', type: 'textarea', required: false, siteSpecific: true },
      ],
    },
  ],
};
```

- [ ] **Step 4: Register it in the bundle**

In `carbon-ready/src/data/methodologies/index.ts`:

Add the import after line 10:

```ts
import { REC_SOLAR_METHODOLOGY } from './rec-solar';
```

Add `REC_SOLAR_METHODOLOGY,` to the re-export block (lines 12–16) and append it to `ALL_METHODOLOGIES` (after `CDM_ARACM0003_METHODOLOGY,`):

```ts
export {
  TVER_WIND_METHODOLOGY, TVER_BIOMASS_METHODOLOGY, TVER_BIOGAS_METHODOLOGY,
  TVER_FORESTRY_METHODOLOGY, TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY, VERRA_VM0047_METHODOLOGY, CDM_ARACM0003_METHODOLOGY,
  REC_SOLAR_METHODOLOGY,
};

export const ALL_METHODOLOGIES: Methodology[] = [
  TVER_SOLAR_METHODOLOGY,
  TVER_WIND_METHODOLOGY,
  TVER_BIOMASS_METHODOLOGY,
  TVER_BIOGAS_METHODOLOGY,
  TVER_FORESTRY_METHODOLOGY,
  TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY,
  VERRA_VM0047_METHODOLOGY,
  CDM_ARACM0003_METHODOLOGY,
  REC_SOLAR_METHODOLOGY,
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd carbon-ready && npx vitest run src/lib/methodology-schema.test.ts`
Expected: PASS — including "accepts every bundled methodology" (now 10 docs) and the new SF-02 test. If the parity test fails, the zod error message names the offending field — fix the data file, not the schema.

- [ ] **Step 6: Run the full SPA suite to catch count assumptions**

Run: `cd carbon-ready && npx vitest run`
Expected: PASS. If any test asserts the number of bundled methodologies (9), update it to 10.

- [ ] **Step 7: Commit**

```bash
git add carbon-ready/src/data/methodologies/rec-solar.ts carbon-ready/src/data/methodologies/index.ts carbon-ready/src/lib/methodology-schema.test.ts
git commit -m "feat(rec): SF-02 production facility registration as methodology-as-data (SPA)"
```

---

### Task 3: Server seed JSON + seed count bump

**Files:**
- Create: `server/prisma/seed-data/methodologies/meth-rec-solar.json`
- Modify: `server/src/seed.test.ts` (the two `methodologies: 9` assertions and the "9 methodologies" test name)

- [ ] **Step 1: Update the failing seed-count test first**

In `server/src/seed.test.ts`, change the test name on line ~31 from `'seeds org, 4 demo users, 4 factors, 9 methodologies — and is idempotent'` to `'seeds org, 4 demo users, 4 factors, 10 methodologies — and is idempotent'`, and change **both** occurrences of:

```ts
      methodologies: 9,
```

to:

```ts
      methodologies: 10,
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/seed.test.ts`
Expected: FAIL — seed produces 9 methodologies, test expects 10.

- [ ] **Step 3: Generate the seed JSON from the SPA literal**

Do NOT hand-transcribe — generate the JSON from the Task 2 data file so the two can never drift. `methodologyToJson` strips `id` and stamps `schema_version: 2` (the filename is the id, per `loadMethodologyDocs` in `server/prisma/seed.ts`), which is exactly the seed-doc contract:

```bash
cd carbon-ready && npx tsx -e "
import { writeFileSync } from 'node:fs';
import { REC_SOLAR_METHODOLOGY } from './src/data/methodologies/rec-solar';
import { methodologyToJson } from './src/lib/methodology-schema';
writeFileSync('../server/prisma/seed-data/methodologies/meth-rec-solar.json', methodologyToJson(REC_SOLAR_METHODOLOGY) + '\n');
console.log('written');
"
```

Expected output: `written`. (If `tsx` is not available in carbon-ready, run `npx --yes tsx` or use the server's tsx: `cd server && npx tsx -e "..."` with adjusted relative paths.)

Then open the generated file and confirm the first keys are `schema_version: 2`, `code: "SF-02"`, `standard: "REC"`, and there is **no `id` key**.

- [ ] **Step 4: Validate the JSON parses under the server schema**

Run:

```bash
cd server && npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseMethodologyJson } from './src/lib/methodology-schema.js';
const r = parseMethodologyJson(readFileSync('prisma/seed-data/methodologies/meth-rec-solar.json', 'utf8'));
if (!r.ok) { console.error(r.errors); process.exit(1); }
console.log('OK', r.methodology.code, r.methodology.pdd_sections.length, 'sections');
"
```

Expected: `OK SF-02 7 sections`

- [ ] **Step 5: Run the seed test to verify it passes**

Run: `cd server && npx vitest run src/seed.test.ts`
Expected: PASS — 10 methodologies, idempotent.

- [ ] **Step 6: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS (baseline was 177 tests; new counts may differ). Any failure that mentions methodology counts or copy-drift points back to Tasks 1–3.

- [ ] **Step 7: Commit**

```bash
git add server/prisma/seed-data/methodologies/meth-rec-solar.json server/src/seed.test.ts
git commit -m "feat(rec): seed meth-rec-solar (SF-02) — 10 methodologies"
```

---

### Task 4: Program chooser (step 0) on the Registration page

**Files:**
- Modify: `carbon-ready/src/pages/Registration.tsx:41-51` (tone map, tracks) and `:53-112` (entry screen)
- Test: `carbon-ready/src/pages/registration.ui.test.tsx`

- [ ] **Step 1: Update existing tests + write new chooser tests (failing)**

In `carbon-ready/src/pages/registration.ui.test.tsx`, replace the `describe('Registration entry — project list scoped to selected methodology', ...)` block with:

```tsx
describe('Registration entry — program chooser then methodology cards', () => {
  function renderEntry() {
    return render(
      <MemoryRouter initialEntries={['/registration']}>
        <Routes>
          <Route path="/registration" element={<Registration />} />
          <Route path="/registration/:pddId" element={<Registration />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('step 0 offers exactly two program cards: TGO and REC', () => {
    renderEntry();
    expect(screen.getByRole('button', { name: /TGO \(T-VER\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /REC \(I-REC\(E\)\)/ })).toBeInTheDocument();
    // No methodology cards before a program is picked
    expect(screen.queryByText('T-VER-S-01')).toBeNull();
    expect(screen.queryByText('SF-02')).toBeNull();
  });

  it('TGO shows the two T-VER cards: solar then forestry', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /TGO \(T-VER\)/ }));
    const cards = screen.getAllByRole('button', { name: /T-VER|VM00|AR-ACM|SF-02/ });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('T-VER-S-01');
    expect(cards[1]).toHaveTextContent('T-VER-F-01');
    expect(screen.queryByText(VERRA_VM0042_METHODOLOGY.code)).toBeNull();
  });

  it('REC shows only the SF-02 card', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /REC \(I-REC\(E\)\)/ }));
    expect(screen.getByText('SF-02')).toBeInTheDocument();
    expect(screen.queryByText('T-VER-S-01')).toBeNull();
  });

  it('back button returns to the program chooser', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /REC \(I-REC\(E\)\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /เลือกโปรแกรมใหม่/ }));
    expect(screen.getByRole('button', { name: /TGO \(T-VER\)/ })).toBeInTheDocument();
  });

  it('clicking a card pops up the modal; with no eligible projects it opens straight on the create form', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /TGO \(T-VER\)/ }));
    expect(screen.queryByText(/Start PDD —/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /T-VER-S-01/ }));
    expect(screen.getByText('Start PDD — T-VER-S-01')).toBeInTheDocument();
    expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ubon Regenerative Rice/ })).toBeNull();
  });

  it('create & start: makes the project, opens its PDD editor', async () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /TGO \(T-VER\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /T-VER-F-01/ }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'ป่าชุมชนทดสอบ' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Nan, Thailand' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start PDD/ }));

    await screen.findByText(/Register: ป่าชุมชนทดสอบ/);
    const st = useStore.getState();
    const project = st.projects.find((p) => p.name === 'ป่าชุมชนทดสอบ')!;
    expect(project.capacity_kwp).toBe(0); // land-based prefill
    const pdd = st.pdds.find((d) => d.project_id === project.id)!;
    expect(pdd.methodology_id).toBe('meth-tver-forestry');
  });
});
```

(The first two original tests are re-expressed with a program click; the last two are the originals with one added `fireEvent.click` line each.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: FAIL — no `TGO (T-VER)` button exists yet.

- [ ] **Step 3: Implement the chooser in Registration.tsx**

In `carbon-ready/src/pages/Registration.tsx`:

3a. Above the `Registration` component (module scope, after line 20), add:

```tsx
type Program = 'tgo' | 'rec';

const PROGRAMS: Array<{ key: Program; title: string; tag: string; desc: string }> = [
  { key: 'tgo', title: 'TGO (T-VER)', tag: 'คาร์บอนเครดิต', desc: 'ขึ้นทะเบียนโครงการลดก๊าซเรือนกระจกกับ อบก. ภายใต้มาตรฐาน T-VER' },
  { key: 'rec', title: 'REC (I-REC(E))', tag: 'ใบรับรองพลังงานหมุนเวียน', desc: 'ขึ้นทะเบียนอุปกรณ์ผลิตไฟฟ้ากับ EGAT (Local Issuer) ตามฟอร์ม SF-02' },
];

// Flagship tracks per program: solar first, forestry second for TGO; SF-02 for REC.
const PROGRAM_TRACKS: Record<Program, string[]> = {
  tgo: ['meth-tver-solar', 'meth-tver-forestry'],
  rec: ['meth-rec-solar'],
};
```

3b. Inside `Registration()`, add program state next to `methId` (line ~31):

```tsx
  const [program, setProgram] = useState<Program | null>(null);
```

3c. Replace the `STANDARD_TONE` map (lines 41–45) with:

```tsx
  const STANDARD_TONE: Record<string, string> = {
    'T-VER': 'bg-emerald-50 text-emerald-700',
    Verra: 'bg-sky-50 text-sky-700',
    CDM: 'bg-amber-50 text-amber-700',
    REC: 'bg-indigo-50 text-indigo-700',
  };
```

3d. Replace the `CARD_TRACKS` block (lines 47–51) with:

```tsx
  const orderedMethodologies = (program ? PROGRAM_TRACKS[program] : [])
    .map((id) => methodologies.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
```

3e. In the `if (!pdd)` entry screen (line 53), render the program chooser when no program is picked. Replace the returned JSX header portion:

```tsx
  if (!pdd) {
    if (!program) {
      return (
        <div>
          <PageHeader title="Register a project" subtitle="เลือกโปรแกรมที่ต้องการขึ้นทะเบียนก่อน" />
          <div className="grid gap-3 sm:grid-cols-2">
            {PROGRAMS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProgram(p.key)}
                className="group rounded-xl border border-ink-200/80 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg"
              >
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">{p.tag}</span>
                <div className="mt-2 text-lg font-bold text-ink-900">{p.title}</div>
                <div className="mt-1 text-[13px] leading-snug text-ink-600">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    const selected = methodologies.find((m) => m.id === methId);
    return (
      <div>
        <PageHeader title="Register a project" subtitle="Pick a methodology card — a project picker will pop up" />

        <button
          type="button"
          onClick={() => { setProgram(null); setMethId(''); setPickerOpen(false); }}
          className="mb-3 text-sm font-medium text-brand-700 hover:underline"
        >
          ← เลือกโปรแกรมใหม่
        </button>

        {/* step 1 — methodology cards */}
        ...existing card grid + StartPddModal unchanged...
      </div>
    );
  }
```

(Everything from the card grid `<div className="grid gap-3 ...">` down to the `StartPddModal` stays exactly as it is today.)

- [ ] **Step 4: Run the registration UI tests**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: PASS (all, including the untouched PDD-form/RegistrationGate/table describes).

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/pages/Registration.tsx carbon-ready/src/pages/registration.ui.test.tsx
git commit -m "feat(rec): program chooser step 0 — pick TGO or REC before methodology cards"
```

---

### Task 5: REC-aware labels ("REC Registration" instead of "PDD")

**Files:**
- Modify: `carbon-ready/src/pages/Registration.tsx` (StartPddModal title/buttons, PddEditor subtitle)
- Modify: `carbon-ready/src/pages/ValidationQueue.tsx:23,26` (subtitle/empty-state copy)
- Test: `carbon-ready/src/pages/registration.ui.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('Registration entry — program chooser then methodology cards', ...)` block:

```tsx
  it('REC flow labels the modal and editor "REC Registration", and seeds SF-02 defaults', async () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /REC \(I-REC\(E\)\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /SF-02/ }));
    expect(screen.getByText('Start REC Registration — SF-02')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'โซลาร์ REC ทดสอบ' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Ratchaburi, Thailand' } });
    fireEvent.change(screen.getByLabelText('Capacity (kWp)'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start REC Registration/ }));

    await screen.findByText(/Register: โซลาร์ REC ทดสอบ/);
    expect(screen.getByText(/REC Registration PDD-/)).toBeInTheDocument();

    const st = useStore.getState();
    const pdd = st.pdds.find((d) => d.methodology_id === 'meth-rec-solar')!;
    // Standard defaults seeded by buildPrefill from the SF-02 doc
    expect(pdd.section_data.registration_type).toBe('New');
    expect(pdd.section_data.facility_country).toBe('Thailand');
    expect(pdd.section_data.volume_evidence_form).toBe('Metering data');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: FAIL — modal still says `Start PDD — SF-02`.

- [ ] **Step 3: Implement the label helper**

In `carbon-ready/src/pages/Registration.tsx`:

3a. Module scope (next to `PROGRAM_TRACKS`):

```tsx
/** REC registrations are SF-02 facility registrations, not PDDs — label accordingly. */
const regNoun = (m: Methodology) => (m.standard === 'REC' ? 'REC Registration' : 'PDD');
```

3b. In `StartPddModal`, change the modal title (line ~180):

```tsx
    <Modal open onClose={onClose} title={`Start ${regNoun(methodology)} — ${methodology.code}`}>
```

change the create-card helper text (line ~205):

```tsx
                <span className="block text-[11px] text-ink-500">ตั้งโปรเจกต์ใหม่แล้วเริ่มกรอก{methodology.standard === 'REC' ? 'ฟอร์มขึ้นทะเบียน REC' : ' PDD'} ต่อทันที</span>
```

change the pick-mode start button (line ~251):

```tsx
              <Button disabled={!projId} onClick={() => void startWith(projId)}>Start {regNoun(methodology)} →</Button>
```

and the create button (line ~271):

```tsx
              <Button loading={busy} onClick={createAndStart}>Create & Start {regNoun(methodology)} →</Button>
```

3c. In `PddEditor`, change the subtitle (line ~351):

```tsx
        subtitle={`${methodology.code} ${methodology.version} · ${regNoun(methodology)} ${pdd.id}`}
```

3d. In `carbon-ready/src/pages/ValidationQueue.tsx`, update the two copy strings:

```tsx
      <PageHeader title="Validation Queue" subtitle="PDDs and REC registrations awaiting review before a project can be registered" />
```

```tsx
          <EmptyState title="Queue is empty" hint="No PDDs or REC registrations are currently awaiting review." />
```

- [ ] **Step 4: Run the tests**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx src/pages/validationqueue.ui.test.tsx 2>/dev/null || cd carbon-ready && npx vitest run src/pages/`
Expected: PASS. If a ValidationQueue test asserts the old subtitle text, update it to the new copy.

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/pages/Registration.tsx carbon-ready/src/pages/ValidationQueue.tsx carbon-ready/src/pages/registration.ui.test.tsx
git commit -m "feat(rec): REC-aware labels — 'REC Registration' in modal, editor, validation queue"
```

---

### Task 6: Full verification + dev-database seed

**Files:** none (verification only)

- [ ] **Step 1: Full SPA suite**

Run: `cd carbon-ready && npx vitest run`
Expected: PASS, zero failures.

- [ ] **Step 2: Full server suite**

Run: `cd server && npx vitest run`
Expected: PASS (baseline 177 + new/updated tests).

- [ ] **Step 3: Type-check + build**

Run: `npm run build` (repo root)
Expected: exit 0, no tsc errors.

- [ ] **Step 4: Seed the dev database with the new methodology**

Run: `cd server && npm run seed`
Expected: idempotent upsert completes; `meth-rec-solar` now exists in the company Postgres. (Server mode reads methodologies from the DB — without this step the REC card has no data in server mode.)

- [ ] **Step 5: Manual smoke test**

Start the app (SPA + server), log in as project owner, open **Register Project**: program chooser shows TGO/REC → REC → SF-02 card → create project → form shows the 7 SF-02 sections with Thai/English labels, defaults seeded (`New`, `Thailand`, `Metering data`) → submit → validator sees it in the queue → approve → project becomes `registered`.

- [ ] **Step 6: Commit any leftover fixes, then wrap up**

```bash
git status   # should be clean apart from intentional changes
```

Use superpowers:finishing-a-development-branch to decide merge/PR next steps.

---

## Self-review notes

- **Spec coverage:** chooser step 0 (Task 4), Standard union 4 files (Task 1), methodology doc SPA+seed (Tasks 2–3), defaults/clone flags in the doc (`defaultValue`/`siteSpecific` — Task 2), labels (Task 5), review-flow/lifecycle untouched (no task needed — verified by Task 6 smoke test), testing section (Tasks 1–6).
- **Deliberate deviations from spec wording:** evidence checklist lives in section-1 help text because `EvidenceCategory` is a closed 7-value enum (constraint #5); Yes/No questions are `select` fields, not `boolean`, because `showIf` needs string equality (constraint #2).
- **Type consistency:** `REC_SOLAR_METHODOLOGY` id `meth-rec-solar` used consistently in Tasks 2, 3, 4 (`PROGRAM_TRACKS.rec`), 5 (test). `regNoun` defined once in Task 5 and used in all label sites. Section keys in Task 2 Step 3 match the Task 2 Step 1 test list exactly.

# Brief: make the methodology detail drawer show how the methodology works (project: dmrv)

## Problem
On **Methodologies**, clicking a code (e.g. `SF-02`) opens a drawer
(`carbon-ready/src/pages/Methodologies.tsx`, the `<Drawer>` block near the bottom).
It only shows section titles with field counts, evidence badges and one line per
monitoring parameter. A developer looking at it can't tell what the methodology
*does*. The `Methodology` object already contains that information, but none of it is
shown: the calculation config, each field's type and flags, the monitoring method and
the official-form template.

## Goal (direction picked by the user: "Pipeline + field detail")
Redesign the drawer so it explains how this methodology drives a project. Show only
values taken from the `Methodology` object (`carbon-ready/src/types/index.ts`
`Methodology`, `PddSectionSchema`, `PddFieldSchema`, `MonitoringParam`,
`MethodologyCalculation`). **Never invent values**: if a value is missing, show a dash
or omit it.

### Layout, top to bottom
1. **Header**: name, then `sectoral_scope · standard version · status`. If
   `document_template` is set, add a chip with
   `OFFICIAL_FORMS[t].badgeLabel` (from `carbon-ready/src/templates/registry.ts`) and the
   template id in mono.
2. **"How it drives a project"**: a 5-step pipeline. Horizontal on desktop, stacked
   vertically on mobile. Each step links (anchors) to its section below:
   - PDD form: total fields · required count · count of `type === 'computed'`
     ("auto-filled from project")
   - Evidence: number of `required_evidence`
   - Monitoring: param keys + frequency
   - Calculation: the formula's short label
   - Official form: template id, or "Generic PDD view" when there is no template
3. **Calculation**: the `formula` key in mono, plus a readable equation built from
   `calculation`. The equations must match `carbon-ready/src/lib/calc.ts`:
   - `grid_displacement`: ER (kgCO₂e) = Σ `{input_param}` (kWh) × grid EF
     (kgCO₂e/kWh, picked per record date from Emission Factors)
   - `biomass_stock_change` / `direct_entry`: ER = Σ `{input_param}` (driver is already tCO₂e)
   - `ch4_avoidance`: ER = Σ `{input_param}` (t CH₄) × GWP_CH₄ (`gwp_ch4`, default 28)
   - Add a note that only monitoring records whose `param_key === input_param` feed the
     calculation.
   - When `standard === 'REC'`, add a caveat based on the comment in
     `carbon-ready/src/data/methodologies/rec-solar.ts`: this config only classifies
     the project as metered generation, and REC volumes (1 REC = 1 MWh) are handled on
     REC Issuance.
   - Put the formula → label/equation map in one place (e.g. `src/lib/labels.ts`)
     so a test can cover it.
4. **PDD sections**: an accordion with one row per section. Native `<details>` is
   fine; it must be keyboard accessible. Add an "Expand all" toggle. The summary shows
   the title, field count and required count. The body shows the section `help` text
   (often Thai), then a field table with columns key (mono) · label · type (+unit) · flags.
   Flags are small badges:
   - `required`
   - `computed ← {source}`
   - `sensitive` (published as hash only)
   - `site-specific` (not copied on clone)
   - `showIf {field} = {equals}`
   - `default = {defaultValue}`
   - select options (count, with the full list on title/hover)
   - table columns

   Use stacked rows on mobile.
5. **Monitoring parameters**: for each param show key, label, unit, frequency and
   **method**. Mark the param equal to `calculation.input_param` as "drives calculation".
6. **Required evidence**: the existing `Badge tone="blue"` with `CATEGORY_LABEL`,
   plus the raw category key in mono.

The table needs more room, so the drawer can go from `size="lg"` to `"xl"`. Consider
extracting the content to `carbon-ready/src/components/methodologies/MethodologyDetail.tsx`.

## Constraints
- **Keep the original look.** Use only the existing tokens and components (`ink`,
  `ink-secondary`, `ink-meta`, `rule`, `ground`, `brand-700`, `Badge` tones, `Card`,
  `Table`). Add no new fonts or colours. Only layout, UX and a11y change.
- No backend change. The drawer reads the methodology objects already in the store.
- The main checkout has uncommitted work (the methodology catalog trim to 3 entries)
  that doesn't touch `Methodologies.tsx`. Base on the committed `feat/sprint-1-mvp`
  HEAD and don't depend on that work.

## Done when
- A UI test (follow the existing `*.ui.test.tsx` pattern, e.g.
  `src/pages/registration.ui.test.tsx`) opens the SF-02 drawer and checks:
  - the `grid_displacement` equation with `EG_PJ`
  - the REC caveat
  - `computed ← project_location`
  - `showIf volume_evidence_form = Other`
  - the `EVIDENT-SF-02` template

  It also checks that T-VER-F-01 shows the biomass/direct equation with `dC_tree`.
- In `carbon-ready/`: `npm test`, `npm run lint` and `npx tsc --noEmit` all pass.
- Screenshots of the SF-02 drawer at desktop and mobile width are attached to the PR/report.

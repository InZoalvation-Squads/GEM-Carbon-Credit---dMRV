# File Cleanup & Rearrangement Design

**Date:** 2026-08-05  
**Status:** Implemented  
**Approach:** A — Light cleanup (approved)

## Goal

Make frontend components and documentation easier to scan without a feature-folder rewrite or route changes.

## Scope

**In**
- Split `carbon-ready/src/components/` into `ui/`, `layout/`, `evidence/`, `project/`, plus existing `charts/`
- Keep co-located `*.ui.test.tsx` next to the component they cover
- Update all imports that reference moved components
- Consolidate docs under repo-root `docs/` (`guides/`, `reports/`, `superpowers/`)

**Out**
- Renaming pages or changing routes
- Restructure of `pages/` (remain flat; tests stay beside pages)
- Server `src/lib/` or modules layout
- Behavior / UI / code logic changes
- Deleting content (moves only; no content rewrite)

## Frontend layout

```
carbon-ready/src/components/
  ui/
    Badge.tsx
    Button.tsx
    Card.tsx
    EmptyState.tsx
    FileDrop.tsx
    Input.tsx
    KpiCard.tsx
    Modal.tsx
    Select.tsx
    StatusBadge.tsx
    Table.tsx
    Textarea.tsx
  layout/
    Drawer.tsx
    PageHeader.tsx
    Sidebar.tsx
    sidebar.ui.test.tsx
    Toast.tsx
    TopBar.tsx
    topbar.ui.test.tsx
  evidence/
    EvidenceDetailModal.tsx
    EvidenceUploadModal.tsx
    evidenceupload.ui.test.tsx
    IpfsJsonModal.tsx
    ipfsjsonmodal.ui.test.tsx
    RequestVerificationModal.tsx
    requestverification.ui.test.tsx
  project/
    ProjectCreditsTab.tsx
    projectcredits.ui.test.tsx
    ProjectEvidenceTab.tsx
    RegistrationGate.tsx
  charts/          # unchanged
    DailyGenerationChart.tsx
    MonthlyReductionChart.tsx
```

### Import update rule

Replace paths like `../components/Button` with `../components/ui/Button` (and likewise for `layout/`, `evidence/`, `project/`).  
Relative imports *inside* moved files (e.g. Modal importing Button) must be updated to the new sibling/subfolder paths.

### Pages

Leave `carbon-ready/src/pages/` flat. No moves.

## Docs layout

Merge into repo-root `docs/`:

```
docs/
  guides/                 # from carbon-ready/docs root (dMRV-*)
    dMRV-How-It-Works.html
    dMRV-User-Guide.md
    dMRV-User-Guide.pdf
    dMRV-Working-Doc.md
    dMRV-Working-Doc.pdf
  reports/                # from docs/reports/
    forestry-workflow-th.html
    forestry-workflow-th.pdf
    progress-update-2026-07-24-th.html
    tver-s01-generation-report.md
  superpowers/
    plans/                # union of docs/ + docs/superpowers/plans
    specs/                # union of docs/ + docs/superpowers/specs
```

After move, remove emptied `carbon-ready/docs/` tree (or leave a one-line README pointing to `../../docs` if any tooling expects that path — prefer delete if nothing references it).

If any plan/spec filenames collide between the two trees, keep both by prefixing the source folder in the name only if needed; otherwise same-name files should be compared and the newer/more complete kept (flag for user if conflict).

## Migration steps

1. `git mv` components into the four folders (+ keep charts)
2. Fix internal component-to-component imports
3. Fix page/layout/template imports
4. Fix test imports that reference moved paths
5. `git mv` docs into `docs/guides`, `docs/reports`, merge superpowers
6. Remove empty `carbon-ready/docs` if unused
7. Run frontend unit/UI tests to confirm green

## Success criteria

- `components/` top level shows only: `ui/`, `layout/`, `evidence/`, `project/`, `charts/`
- All docs live under root `docs/` with clear `guides` / `reports` / `superpowers`
- App still builds; existing UI tests pass
- No route or product behavior change

## Risks

- Missed import → Vite compile error (caught quickly by `npm run build` / vitest)
- Broken relative paths inside co-located tests — update in same PR
- External links to `carbon-ready/docs/...` (if any) — update if found in README or scripts

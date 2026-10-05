# Ledger Explorer: full redesign brief for `carbon-ready/`

Read `PRODUCT.md` (repo root) first. It holds product truth. This brief holds the visual world and the build rules, and the audit that motivated the redesign is `docs/reports/2026-10-05-impeccable-ui-audit.md`. The user chose this direction on 2026-10-05: **Ledger Explorer**, using GEM petrol and lime across the whole app.

## Direction contract (paste verbatim as the first child of `<body>` in `carbon-ready/index.html`)

```html
<!--
THESIS: Every record is a block — figure, measured source, and the hash tying it to the one before; refuses the KPI-card SaaS dashboard.
OWN-WORLD: Petrol #0e3e4e rail and chain spine, flat paper ground #f7f9f8, hairline-ruled ledger rows, monospace for hashes/ids/figures only, lime #d0ffa0 reserved for anchored/verified state. No gradients, glow, or icon tiles.
STORY: Staff, auditors, registry officers and executives see where every number came from, what state each submission is in, and what is anchored — then act.
FIRST VIEWPORT: Dashboard = head block (portfolio totals in one ruled row) atop a vertical chain of per-project latest blocks; provenance/anchor panel right; primary action in the page header row.
FORM: Ledger Explorer, grounded list #5 of 7; seed 53c35950.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
```

## Scene

GEM ops staff and VVB auditors spend long sessions at office desks in daylight; registry officers review queues; executives glance at totals on a phone in meetings. **Light working ground, with a committed petrol rail.** There is no dark mode in this build.

## Hard constraints (do not violate)

1. **Same routes, nav groups, nav order, page set and step order.** `App.tsx` routes stay identical, and every page keeps its functions, buttons, forms, modals and drawers. This is a re-skin and re-layout within each page, not a re-architecture.
2. **Do not touch logic.** `src/lib/**`, `src/store/**`, `src/data/**`, `src/types/**` and the whole `server/` directory are off-limits, except where a page is moved to `React.lazy` in `App.tsx`.
3. **Official form bodies stay faithful.** `src/templates/TverSF001Pdd.tsx`, `EvidentSF02.tsx`, `EvidentSF04.tsx`, `OfficialForm.tsx` and `RecIssueOfficialForm.tsx` reproduce TGO/I-REC government documents. Do not restyle the printed form body. You may restyle only the app chrome around them (toolbar, back link, page frame).
4. **Real data only.** Never add invented numbers, sample values, fake activity, testimonials or placeholder people. Empty states teach the next action and contain no fabricated data.
5. **Copy: keep the wording.** You may only delete eyebrow/kicker labels (banned), remove the false "Realtime" claim on the Dashboard subtitle (say "Overview of your solar rooftop portfolio" or similar truthful text), and fix error copy that doesn't name a recovery. Thai strings stay exactly as written.
6. **Tests stay green.** The baseline is 57 files / 535 tests passing and `tsc -b` clean. Run `npx vitest run` and `npx tsc -b` in `carbon-ready/` before you finish. Tests query by text and role, so keep accessible names and visible strings. If a test asserts a dead control you removed (for example the theme toggle), update that test minimally and **list every test change in your final message**. Never delete or weaken a test to make it pass.
7. **No new dependencies.** Use what's in `package.json`: React, Tailwind 3, lucide-react, Recharts.

## Tokens (implement as CSS custom properties on `:root` in `src/index.css`, mapped in `tailwind.config.ts`)

Replace the emerald `brand-*` and unused `accent-*` palettes. Keep the Tailwind class *names* you need by remapping them, or migrate usages. Either way, zero `emerald-*`, `teal-*`, `cyan-*`, `violet-*`, `indigo-*` or `sky-*` classes should remain in `src/` outside `src/templates/`.

| Token | Value | Use |
|---|---|---|
| `--petrol-950` | `#061e26` | deepest rail shade |
| `--petrol-900` | `#082833` | rail hover / pressed |
| `--petrol-800` | `#0b3340` | rail |
| `--petrol-700` | `#0e3e4e` | **brand**: primary buttons, spine, active nav, headings accent |
| `--petrol-600` | `#16586a` | links, focus ring, chart series 1 (7.96:1 on white) |
| `--petrol-100` | `#e3eef0` | selected row, info wash |
| `--petrol-50` | `#f1f7f8` | hover row |
| `--lime-400` | `#d0ffa0` | **brand**: anchored/verified fill, active indicator on the petrol rail. **Never** text on white |
| `--lime-300` | `#e2ffc4` | anchored row wash |
| `--lime-ink` | `#4d7c0f` | lime-family text/icons on white (4.99:1) |
| `--ground` | `#f7f9f8` | page ground (flat; delete the radial gradients and the faint grid) |
| `--surface` | `#ffffff` | ledger sheets |
| `--surface-sunk` | `#eef3f2` | table header, code wells |
| `--rule` | `#d5dedc` | hairlines between rows/blocks (decorative, 1px) |
| `--rule-strong` | `#7d8f8c` | input borders and other UI component boundaries (verify ≥3:1) |
| `--ink` | `#10201f` | primary text |
| `--ink-2` | `#3c4f4d` | secondary text |
| `--ink-3` | `#5b6d6a` | meta text. **This is the lightest text colour allowed**; nothing lighter for text |
| `--on-petrol` | `#ffffff` | text on petrol |
| `--on-petrol-2` | `#b9cfd4` | secondary text on petrol (7.12:1) |
| `--state-review` | `#2f5d8a` | under review / submitted |
| `--state-revision` | `#9a6212` | revision required / warning |
| `--state-rejected` | `#a3262e` | rejected / error / destructive |

**Status vocabulary (one map, in `StatusBadge.tsx`, used everywhere).** Delete the local status maps in `Projects.tsx:99`, `ProjectDetail.tsx:50` and `Registration.tsx:60` and route them through it.

| State | Look |
|---|---|
| draft | outline in `--rule-strong`, `--ink-2` text |
| submitted / under_review | `--state-review` text, faint tint |
| revision_required | `--state-revision` |
| approved / active | petrol-700 fill, white text |
| anchored / verified | lime-400 fill, petrol-800 text, plus the lucide `Link2` icon |
| rejected / suspended / archived | `--state-rejected` |

Every badge pairs colour with a text label (never colour alone).

## Type

- UI: **Inter** (400/500/600) with **Anuphan** (400/500/600) for Thai, as now. Trim `index.html`'s Google Fonts request to exactly these weights plus **JetBrains Mono** 400/500.
- Mono is only for hashes, IDs, block/sequence numbers, timestamps and tabular figures in ledger rows, never for headings or labels.
- Fixed rem scale at a 1.2 ratio: 12 / 14 / 16 / 20 / 24 / 30. The minimum size anywhere is **12px**, and Thai text is at least 13px. Remove every `text-[10px]` and `text-[11px]`, and remove tracked uppercase on Thai labels.
- Headings are balanced. There are no eyebrows/kickers above headings (remove `PageHeader`'s eyebrow prop usage and the prop itself).

## The world: components

- **Ledger sheet**, replacing the rounded shadowed `Card`: a white surface, 1px `--rule` border, radius 6px, **no shadow at rest**. Header rows are separated by hairlines, not padding blobs. Nested cards are forbidden; inside a sheet, use ruled rows.
- **Block row**, the signature unit. Each record (a monitoring upload, calculation, verification package, PDD, REC request or audit entry) renders as a row with:
  - a left gutter showing its block number or short id in mono
  - a node on the **chain spine**: a 2px petrol-700 vertical line connecting consecutive rows, with a node per row that is filled when approved, lime-ringed when anchored, and hollow when draft
  - the main figure
  - a source/provenance line (for example "measured · CSV upload 1 Jul 2026" or "EF TH/EGAT v2")
  - a status badge
  - a `HashChip` on the right

  Build it once as `components/ui/BlockRow.tsx` (plus a `ChainList` wrapper that draws the spine) and use it on Dashboard (projects' latest blocks), AuditLog, Verifications, ValidationQueue, RecIssuance, Guardian registry, and ProjectDetail activity.
- **Head block**, replacing `KpiCard`: one ruled row of 3–4 figures separated by vertical hairlines. Each figure is a label (14px `--ink-2`) over a value (24–30px, tabular), with an optional unit and source line. There are no icon tiles and no hover lift. Delete `KpiCard.tsx` once it is unused.
- **Magnitude dots**: in lists that carry tCO₂e, a small dot to the left of the figure uses a fixed diameter ramp (4/6/8/10/12px by quantile of the visible set), so magnitude reads before the number. Decorative only: `aria-hidden`.
- **Visible grid**: forms and block layouts snap to the 12-column grid, which already exists in Registration's field grid. Give the page container a consistent 12-col grid with a 24px gutter.
- **Buttons**:
  - primary is petrol-700 fill with white text, hover petrol-800, focus ring petrol-600 at 2px offset
  - secondary is white with a `--rule-strong` border and ink text
  - ghost is text-only petrol-600
  - destructive is `--state-rejected`
  - no gradients, no glow (delete `shadow-glow` and `brand-gradient`)
  - minimum height 40px (32px allowed for `size="sm"` in dense tables only, but its hit area must be at least 24×24)
- **Inputs, Select, Textarea**: white, 1px `--rule-strong`, radius 6px, 40px height, petrol-600 focus ring. Labels are always visible. Fix the 6 placeholder-only controls (`Projects.tsx:50,51`, `ReviewDetail.tsx:266`, `ValidationDetail.tsx:115`, `EvidenceUploadModal.tsx:172`, `ProjectEvidenceTab.tsx:51,58`) with real `<label>`s (visually hidden is fine for search) and route `ProjectEvidenceTab`'s bespoke controls through the shared primitives.
- **Tables**: `--surface-sunk` header, 1px row hairlines, tabular numerals, mono for ids/hashes, 44px rows, `--petrol-50` row hover, and a sticky header. On mobile (<640px), tables that list entities (Projects, Verifications, etc.) collapse into stacked block rows instead of a sideways-scrolling table.
- **Tabs**: one shared `Tabs` component with `role="tablist"`/`tab`/`tabpanel`, `aria-selected` and arrow-key navigation, with a petrol-700 2px underline for the active tab. Use it in ProjectDetail, Guardian and Calculations. One shared `Segmented` filter with `aria-pressed` replaces the duplicated chips in RecIssuance and Verifications.
- **Modal and Drawer**: add `aria-labelledby` to the title, initial focus on the first focusable element, a focus trap, focus return to the trigger on close, and body scroll lock. Keep Escape and portal behaviour. Overlay: petrol-950 at 50%, with no blur.
- **Toast**: one persistent `aria-live="polite"` region, with errors in a separate `role="alert"` region. Width `min(20rem, calc(100vw - 2rem))`. Dismiss target at least 32px.
- **Charts** (Recharts):
  - all colours come from the CSS vars (read them via `getComputedStyle` once, or pass constants imported from a single `lib`-free `src/components/charts/theme.ts`)
  - generation area is petrol-600 with a 10% flat fill (no gradient)
  - reduction bars are petrol-700, and anchored periods are lime-400 with a petrol outline if that data is available; otherwise all petrol
  - hairline grid in `--rule`, axis text `--ink-3` at 12px
  - fix the clipped last x-axis tick ("30 Jun")
- **Icons**: lucide only, one stroke width (1.75). Replace the emoji ⛓ 🔒 ✨ (`ReviewDetail.tsx:125,132`, `PddDocument.tsx:78`, `Guardian.tsx:55`, `Registration.tsx:554`) with lucide `Link2` / `Lock` / `Sparkles`.
- **Browser surfaces**: `::selection` in petrol-100 / ink, the caret in petrol-600, scrollbar thumb in `--rule-strong`, link underline-offset 3px, `font-variant-numeric: tabular-nums` on every figure and table.

## Shell (AppShell, Sidebar, TopBar)

- **Sidebar (rail)**: petrol-800 ground with white/`--on-petrol-2` text.
  - Nav group labels: 12px, `--on-petrol-2`, sentence case, no tracking.
  - Active item: petrol-950 background, a 3px lime-400 indicator **as a small rounded bar inside the item** (not a border-left on a card), and white text.
  - A thin chain spine runs down the rail behind the group labels as a quiet motif (1px `--on-petrol-2` at 30%, decorative, `aria-hidden`).
  - The org card at the bottom sits flat on the rail. Remove the pulsing "v0.3.0 · Sprint 3 · Guardian" dot; keep the version text static at `--on-petrol-2`.
  - `<nav aria-label="Main">`.
- **TopBar**: petrol-700 flat (no gradient), with the logo (`gem-logo.svg` / `gem-logo-dark.svg`, whichever reads on petrol).
  - **Remove the dead Theme button.**
  - **Notifications**: remove the bell entirely, since there is no notification feature.
  - **Language**: if TopBar's TH/EN button only changes nothing, remove it. Login keeps its own working toggle.
  - Keep the user menu (it works). The mobile menu button gets `aria-expanded` + `aria-controls`.
- **AppShell**:
  - a skip link "Skip to content" as the first focusable element
  - `<main id="content" tabIndex={-1}>`
  - set `document.title` per route ("<Page> · GEM Carbon Credit")
  - set `document.documentElement.lang` to `th` when the Login language state or the page content is Thai; at minimum, mark Thai blocks with `lang="th"` on their container
  - remove `key={pathname}` remounting
- **Mobile drawer**: Escape closes it, focus moves into it on open and returns on close, and the slide transition actually plays (don't toggle `hidden`; use transform + `inert`/visibility).
- **Code splitting**: `React.lazy` + `Suspense` for every route except Login/Dashboard, and for the official templates. The fallback is a quiet skeleton block row, not a spinner.

## Pages: what each one becomes (same content, ledger grammar)

- **Dashboard**:
  - head block (Total generation, Carbon reduction, Active projects, Latest upload), each with a source line
  - the daily generation chart as a full-width ledger sheet
  - beneath it, a "Latest blocks" `ChainList`: one block row per project's latest monitoring/calculation record (real store data only), with status + hash
  - Monthly reduction and Recent activity sit beside or below on a 12-col split
  - the empty Recent activity teaches the next action ("Upload monitoring data" link)
- **Projects**: labelled search + status filter in one toolbar row; ledger table, with block rows on mobile; local StatusBadge removed.
- **ProjectDetail**: header with project facts in a definition-list ruled grid; shared Tabs; evidence/credits/activity as block rows.
- **Upload / IoT Mapping / Calculations / Emission Factors**: ledger sheets; the CSV validation results as ruled rows with per-row status; calculations show the EF version as a provenance line on every figure.
- **Verifications / ValidationQueue / RecIssuance**: queue = `ChainList` of block rows (using `<Link>`s, not `navigate()` buttons), with Segmented filters and SLA timers in mono.
- **ReviewDetail / ValidationDetail**:
  - required-category coverage as a ruled checklist
  - the comment thread as ruled rows with labelled textareas
  - the **Anchor to Hedera Guardian** action is the one authored motion moment in the app: on success, the package's node on the spine closes into a lime-ringed anchored node and the HCS coordinates (topic / sequence / consensus timestamp) slide in as a provenance line, in 200–250ms with exponential ease-out, and an instant swap under `prefers-reduced-motion`
- **Guardian**: Schema and Credential Registry tabs; the registry is a `ChainList` of anchored blocks with HashScan links.
- **AuditLog**: the purest expression. The hash-chained log is a `ChainList` where each row shows `row_hash` linking to the previous one. The verified/broken banner is a ruled sheet header: lime-ink + `Link2` for verified, `--state-rejected` for broken.
- **Methodologies / Registration / PddDocument / OfficialForm chrome**: ledger sheets; methodology cards become a ruled selectable list (keep the `aria-pressed` buttons); the Registration stepper is a horizontal chain of step nodes (filled = complete, petrol ring = current, hollow = upcoming); keep the 12-col field grid committed in `793a38d`.
- **HowItWorks**: drop the glow blobs and the `blur-3xl`; the workflow becomes one long chain spine of stages with ruled explanatory rows; fix the 1.40:1 and 2.56:1 text; convert the 35 pointer-styled non-interactive elements to non-pointer or to real buttons/links.
- **Login / Register**:
  - the petrol + lime world at full commitment: the form on white, the carousel panel on petrol
  - add a **pause/play control** to the 6s carousel and stop auto-advance under reduced motion
  - demo account cards become real `<button>`s
  - the error message gets `role="alert"` + `aria-describedby`
  - replace `bg-[#f2f4f3]` / `bg-[#e9ebe9]` with tokens

## Accessibility floor (verify before finishing)

- WCAG 2.2 AA contrast everywhere outside `src/templates/`: no text lighter than `--ink-3` on light surfaces or `--on-petrol-2` on petrol.
- Every interactive element has a visible focus ring, a 24×24 minimum target (44 on touch layouts for primary nav and actions), and an accessible name.
- Heading order on every page is h1 → h2 → h3; `CardHeader`/sheet titles become h2.
- Reduced motion: keep the global safety net, but the Loader2 spinner and the anchor transition must have intentional static alternatives.

## Deliver in this order

1. Tokens + tailwind config + `index.css` + `index.html` (fonts, contract comment).
2. UI primitives (Button, Sheet/Card, Badge/StatusBadge, Input/Select/Textarea, Table, Tabs, Segmented, Modal, Drawer, Toast, HashChip, EmptyState, FileDrop, BlockRow/ChainList, HeadBlock) and charts theme.
3. Shell (AppShell, Sidebar, TopBar) + code splitting.
4. Every page listed above.
5. `npx tsc -b` and `npx vitest run` green, plus `npx vite build`.
6. Final message: files changed (grouped), every test file changed and why, anything you could not do and why, and remaining hard-coded colours outside templates (should be none).

---

## Amendment, 2026-10-05: user feedback after phase 1–2

The user asked for three things. These override the brief above where they conflict.

### A. Sidebar: close to the ORIGINAL, and easy on the eyes ("คล้ายๆเดิม และสบายตา")

Revert the dark petrol rail. Rebuild the sidebar in the structure of the original (`git show 21bf26e:carbon-ready/src/components/layout/Sidebar.tsx`), re-skinned in the new tokens. Keep every phase-1 accessibility gain.

- **Rail:** light rail `#f3f6f5` (add `--rail` token) with a 1px `--rule` right border. No petrol fill and no chain-spine motif.
- **Group headings:** like the original (uppercase English, small, tracked), but legible:
  - 12px, font-semibold, tracking 0.06em, colour `--ink-3`
  - Thai headings: no uppercase, no tracking
- **Items:** the original anatomy (`rounded-lg px-3 py-2 text-sm`, 18px icon, then the label).
  - Inactive: `--ink-2` text and `--ink-3` icon. On hover, `bg-white/70` with `--ink` text.
  - Active: white background, 1px `--rule` ring, a soft xs shadow, font-semibold, `--ink` text and a petrol-700 icon. The original's small left indicator bar comes back (3px × 20px, rounded-r) in **petrol-700**.
  - Colour transitions take 150ms.
- **Org card:** the original white card with border and radius, plus a small petrol-50/petrol-700 icon tile. The version line is static at 12px `--ink-3`, with **no pulsing dot**.
- **Keep from phase 1:** `nav aria-label`, the mobile drawer (transform slide 200ms ease-out, `inert` when closed, Escape, focus in/out, backdrop petrol-950/40 without blur), and 44px touch targets on mobile.
- **TopBar:** stays petrol-700 flat, as the original header was petrol.
- **Contract:** update the direction-contract comment in `index.html`. OWN-WORLD becomes "Petrol top bar and chain spine, light rail…" (the rest unchanged).
- **"Easy on the eyes" app-wide:**
  - No pure-black text (`--ink` is fine).
  - No pure-white page ground (`--ground` stays `#f7f9f8`).
  - Sheets on white with soft `--rule` borders.
  - Avoid large saturated petrol blocks inside page content: petrol is for the top bar, primary buttons and small state marks.

### B. Skeleton loading, lazy loading, smooth response

- **Skeletons that mirror layout.** Each route's Suspense fallback is a skeleton of that page's real shape: page title bar, then a head-block row of 3–4 figure skeletons, then a sheet with 6 row skeletons; forms show field skeletons. Heights must match the loaded layout, so there is **zero layout shift** when content arrives.
  - Shimmer: a subtle 1.6s sweep on `--surface-sunk`. Under reduced motion, a static block.
  - Expose a reusable `Skeleton` and `SkeletonRows` in `components/ui`.
- **Data skeletons.** In server mode (`VITE_API_BASE_URL` set), while the store has not hydrated yet, show skeletons in head blocks, tables and charts instead of zeros or empty states. Read the existing hydrate/loading state from the store; do **not** change store logic. If no such flag exists, report it rather than inventing one.
- **Lazy loading.**
  - Recharts chart components are `React.lazy` with a chart-shaped skeleton.
  - Every `<img>` gets explicit `width`/`height`, `decoding="async"`, and `loading="lazy"`, except the first login slide (`fetchpriority="high"`).
  - Preload the next login slide image.
- **Prefetch on intent.** Hovering or focusing a sidebar link calls the route's dynamic `import()` once (share the lazy factories with `App.tsx`), so clicking feels instant.
- **Smooth interaction.**
  - Search and filter inputs on large lists (Projects, AuditLog, Verifications, RecIssuance) use `useDeferredValue` or `startTransition`, so typing never stalls.
  - Memoise expensive derived values at the page level with `useMemo` (for example Dashboard's summary) without touching `src/store`.
  - Hover/press/selection transitions are 150–200ms ease-out on colour, background, border and opacity only.
  - Route content may take at most a 120ms opacity fade-in, with no slide or stagger choreography.
  - Scroll the main region to the top on route change.
- **Verify.** No long tasks over 50ms on typing in Projects search with seed data (measure with `performance.now` in a quick test or reason from code), and no CLS from images or skeletons.

### C. Illustrations painted by ChatGPT Sol 6.1 (assets already in `carbon-ready/public/illustrations/`)

The files are WebP, in one petrol and lime line-art family. Treat them as decorative: `alt=""` + `aria-hidden` wherever adjacent text already says the same thing.

- **Login** (`login-1.webp` … `login-3.webp`, 1200×800, petrol background): replace the three slide photos, in the same order and with the same copy. The slide panel sits on petrol so the art blends in. Use `object-contain` or `object-cover` without cropping the subject. The carousel behaviour from phase 2 stays (pause, reduced motion).
- **HowItWorks:**
  - `hiw-hero.webp` (transparent, cropped) heads the page under the h1
  - `hiw-1.webp` … `hiw-7.webp` (transparent, cropped to content, longest side 480px; aspect ratios vary, so place each in a fixed square box with `object-contain` and pass its natural width/height) go one per FLOW step in order: create+PDD+evidence, submit, validate+register, sign+anchor credential, upload monitoring, verification+anchor, mint credits
  - display at 64–96px beside each step on desktop, and above it on mobile
- **EmptyState:** add an optional `illustration` prop (a src string), rendered at 120px with fixed width/height and `loading="lazy"`. Map:
  - Projects "No projects yet" → `empty-projects`
  - Dashboard "No activity yet" → `empty-activity`
  - ValidationQueue "Queue is empty" → `empty-queue`
  - Verifications, RecIssuance and AuditLog "no match" → `empty-filter`
  - Guardian "No credentials anchored / no tokens / no trust chain" → `empty-anchor`
  - IotMapping (all three) → `empty-iot`
  - PDD/document "not found" in pages and `OfficialForm.tsx`/`RecIssueOfficialForm.tsx` wrappers → `empty-document` (never inside the printed template bodies)
  - ProjectDetail "No PDD yet" → `empty-document`
  - Calculations, ProjectCreditsTab, ProjectEvidenceTab and RegistrationGate → pick the closest of the above

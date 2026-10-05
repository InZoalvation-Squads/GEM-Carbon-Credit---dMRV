# Carbon Ready — shipped design

This describes the current `carbon-ready/` UI after the original visual system was restored from `21bf26e` and the phase 5 finish fixes were applied. Product behavior remains governed by `PRODUCT.md`. The earlier redesign palette proposals are superseded by this shipped visual contract.

## Visual contract

The owner preference is standard, compact and solid: one line where possible, word-boundary wrapping for names, and ellipsis with a full-value title tooltip for technical identifiers. Never split a name or id mid-word. The Dashboard order is head block, daily generation chart, then the per-project latest-block chain with recent activity on the right at desktop widths. Its primary action is in the page header row.

The original fonts, colors, sizes and sidebar are binding. Inter with Anuphan for Thai is the UI family; JetBrains Mono is used for technical ids, hashes and timestamps. The original Google Fonts weights remain in `index.html`. The lightest text is ink-500 (`#64748b`), including sidebar headings; lighter ink tokens are retained for non-text decoration.

## Tokens and surfaces

`tailwind.config.ts` carries the original palettes and background tokens:

- `brand-*`: emerald actions, selected states and focus accents, from brand-50 `#ecfdf5` through brand-500 `#10b981`, brand-600 `#059669` and brand-900 `#064e3b`.
- `ink-*`: slate surfaces and text; primary ink-900 `#0f172a`, secondary ink-600 `#475569`, meta ink-500 `#64748b`, rules ink-200 `#e2e8f0` and stronger boundaries ink-300 `#cbd5e1`.
- `accent-*`: the original teal palette remains available, including accent-500 `#14b8a6` for reduction charts.
- `petrol-*`: the GEM petrol family, including petrol-600 `#0e3e4e`, for the header and original brand contexts.
- `lime-*`: pastel lime `#d0ffa0` is restricted to header avatar/logo and Login art. Workflow badges and ledger nodes use the restored emerald status styling.
- `bg-brand-gradient`: original emerald-to-teal primary action gradient. `bg-header-gradient`: original petrol header gradient (`#0e3e4e` → `#0c3744` → `#0b3340`).
- Ground `#f6f8fb`: the original soft radial backdrop, with `bg-grid-faint` at a 32px grid in the app content. White sheets retain the original rounded corners, slate rules and soft card shadow.

The compatibility names `rule`, `surface`, `ground`, `rail`, `ink-secondary` and `ink-meta` map to these shipped colors. They do not introduce a replacement palette. Charts use `components/charts/theme.ts`: emerald generation, teal reduction, slate rules and ink-500 axis text.

## Shell

The sidebar retains the original light ink-50 background, original groups/order/role guards, rounded items, 18px icons, white active ring/shadow and emerald indicator. Group headings keep their original size and tracking with ink-500 text. The organization card and version line keep the original anatomy. The TopBar uses the petrol header gradient and lime avatar.

The shell keeps the skip link, named navigation, working user menu, mobile menu state, focus management, Escape handling and focus return. The mounted mobile sidebar uses transform/visibility and is inert while closed. Routes, navigation functions, Thai copy and printed TGO form bodies are preserved.

## Ledger primitives

- `BlockRow`: default rows reserve a 6rem mono id column, followed by a node in the gutter and the figure/source/status/hash. Ids longer than 11 characters show their first six and last four characters separated by an ellipsis, with a full title and screen-reader value. The visible id never wraps. The default node center and ChainList spine center are both 120px from the left.
- `BlockRow density="compact"`: no id column; node and spine centers sit at 16px. The first line has a text-sm medium-weight figure with word-boundary wrapping and a right-aligned status badge. The second line carries mono text-xs source/time, short id and inline HashChip. Dashboard Guardian/Recent Activity and ProjectDetail activity use this density.
- `ChainList`: an ordered list on a sheet with a 2px ink-200 spine. Matching `density="compact"` aligns compact nodes; `framed={false}` supports chains inside an existing sheet.
- `HeadBlock`: ruled portfolio figures. Below sm, two columns with per-cell bottom/right rules, px-4 py-3 padding and 20px values place the Dashboard chart within the first phone viewport. At sm+, it returns to one row with the original 26px values and px-5 py-4 cells. Formatted dates wrap only at the comma. Its skeleton follows the same responsive grid.
- `Sheet` / `Card`: shared white surfaces, headers and bodies with restored radius, borders and shadow. `Sheet` is an alias of Card.
- `Tabs`: shared ARIA tabs with selection, panel association and arrow-key navigation. `Segmented`: shared pressed-state filter controls.
- `StatusBadge`: the shared workflow vocabulary; every state includes its text label. Anchored/verified badges include Link2 with restored emerald styling.
- `HashChip`: copyable technical values, middle truncation, full-value tooltip and copy feedback.

Projects render a compact mobile list below sm and the original table at sm+. Mobile rows show the complete word-wrapped project name and status, location/capacity, commissioned/latest-upload dates, and a named Edit pencil with a 44px minimum target. Responsive CSS display exposes only the relevant layout; mobile links/actions have distinct accessible names. Other entity tables stay stacked on phones, with a 2px `#e2e8f0` spine, `#cbd5e1` node ring and inline label/value cells.

## Loading and response

`Skeleton`, `SkeletonRows`, `HeadBlockSkeleton`, `ChartSkeleton` and `RouteSkeleton` reserve page-shaped loading space. Shimmer is static under reduced motion. `LazyCharts.tsx` puts Recharts behind lazy boundaries with reserved chart height. Shared cached `routeLoaders.ts` factories support sidebar hover/focus prefetch and route loading. Existing deferred search/filter values and page-level memoization preserve responsive typing without domain logic changes. The main scroll region resets on pathname changes.

App-chrome images reserve dimensions and decode asynchronously. Below-fold images load lazily; TopBar/Login/Register logos load eagerly, as do the HowItWorks hero and the first Login slide with high fetch priority. Login preloads its next slide and keeps pause/manual/reduced-motion controls.

The existing store has no server pending/hydrated flag. A global server-hydration skeleton gate therefore remains unavailable without changing store logic; existing page-local loading states are used where present. Source layout reservations do not constitute a measured zero-CLS guarantee.

## Illustration map

Existing WebPs in `public/illustrations/` remain decorative (`alt=""`, `aria-hidden="true"`), with reserved dimensions and object-contain sizing; no art is generated or modified.

| Art | Shipped placement |
| --- | --- |
| login-1, login-2, login-3 | Login carousel, original order/copy, 1200 × 800 |
| hiw-hero | HowItWorks below the h1; eager/high priority, natural 1200 × 356, centered with max-h-64 and max-w-full |
| hiw-1 through hiw-7 | Seven workflow steps in order, 96px square boxes with natural varying dimensions |
| empty-projects | Projects empty state |
| empty-activity | Dashboard empty activity; Calculations empty result |
| empty-queue | ValidationQueue empty queue |
| empty-filter | Verifications, REC Issuance, AuditLog and ProjectEvidenceTab filtered-empty states |
| empty-anchor | Guardian empty credential/token/trust chain; ProjectCreditsTab |
| empty-iot | All three IoT Mapping empty states |
| empty-document | Document/PDD not-found guards, ProjectDetail without PDD, ProjectEvidenceTab, RegistrationGate and official document wrappers |

Empty-state art uses fixed 120px boxes. No illustration enters a printed form body. Routes, real-data sources, dependencies and the protected `src/lib`, `src/store`, `src/data`, `src/types` and `server/` directories remain unchanged by phase 5.

## Phase 5 verification

In `carbon-ready/`, `npx tsc -b` passed, `npx vitest run` passed **71 files / 725 tests** (baseline 68 / 716; nine added tests), and `npx vite build` passed with **3079 modules**. The initial bundle is 483.79 kB / 151.42 kB gzip, with charts remaining lazy. Existing React Router future warnings and async-test act warnings remain.

New component tests cover BlockRow identifier access/truncation and compact layout, Illustration priority/default loading, and HeadBlock mobile rules/date wrapping/skeleton geometry. Projects tests retain the desktop search-count assertion, add an equal mobile search count, and cover real mobile facts plus the existing edit drawer. HowItWorks retains its illustration/content checks and asserts eager/high-priority capped hero behavior while keeping step art lazy. No existing assertion is removed or weakened.

The protected directories, dependency manifest, original token config, sidebar and printed templates have no phase 5 diff. A TypeScript AST comparison confirms Thai string and JSX text literals are unchanged across modified UI source files. `git diff --check` passes. No commits or delivery scripts/archives/patch exports were created.

Live desktop/mobile viewport verification remains unmeasured: starting Vite on localhost returned sandbox `EPERM`. The responsive source and automated checks pass, but they do not establish a rendered 390 × 844 viewport or measured CLS result.

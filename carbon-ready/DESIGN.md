# Ledger Explorer

Binding source: `../docs/redesign/2026-10-05-ledger-explorer-brief.md`.
Phase 1 delivered steps 1–3 at `fca6856`. Phase 2 adopts the world throughout pages and feature components (steps 4–6). The phase 1 notes below are historical; the phase 2 section records the current implementation.

## Foundation

- CSS variables are the colour source; RGB companions preserve Tailwind opacity modifiers. Existing `brand-*` and `ink-*` names remain compatibility aliases. Inter / Anuphan load 400/500/600; JetBrains Mono loads 400/500. The direction contract is copied verbatim as the first body child.
- Sheets are flat, ruled and 6px rounded. `KpiCard` remains a public-prop-compatible adapter to `HeadBlock` until Dashboard adopts one portfolio row. Shared status styles support project, verification, PDD, REC and anchored states with existing labels retained.
- `BlockRow` / `ChainList` accept real caller data; they never generate records or figures. Magnitude dots depend only on the caller's visible numeric set. `Tabs` and `Segmented` are ready for page adoption.
- Modal / Drawer / mobile rail share focus, Escape, return, background isolation and nested scroll-lock handling. The rail stays mounted, uses transform/visibility transitions and is inert when closed on mobile. Polite and error toast regions remain mounted.
- The shell supplies a skip link, content focus target, route titles, Thai content annotations, a 12-column container and the petrol rail. Login's actual language state sets the document language. Dead theme, language and bell controls are removed; role switching and server refresh retain their existing behavior.
- Routes except Login / Dashboard use lazy loading, with quiet skeleton boundaries. T-VER, SF-02 and SF-04 templates load separately. Dispatcher boundaries changed; printed template bodies did not.
- Charts share CSS token paints, flat fills, 12px axes and static rendering under reduced motion. Daily generation reserves end space and preserves the final tick.

## Changed files by area

- Tokens: `src/index.css`, `tailwind.config.ts`, `index.html`.
- UI: `src/components/ui/{Badge,Button,Card,EmptyState,FileDrop,HashChip,Input,KpiCard,Modal,Select,StatusBadge,Table,Textarea}.tsx`; new `{BlockRow,ChainList,Drawer,HeadBlock,RouteSkeleton,Segmented,Sheet,Tabs}.tsx` and `useDialogFocus.ts`.
- Charts: `src/components/charts/{DailyGenerationChart,MonthlyReductionChart}.tsx`, new `theme.ts`.
- Shell: `src/components/layout/{Drawer,PageHeader,Sidebar,Toast,TopBar}.tsx`, new `RouteMetadata.tsx`, `src/layouts/AppShell.tsx`, `src/App.tsx`.
- Compatibility only: `src/pages/{Dashboard,HowItWorks,IotMapping}.tsx` lose the removed eyebrow prop; `src/pages/Login.tsx` follows its working language state.
- Template loading: `src/templates/{registry.ts,OfficialForm.tsx,RecIssueOfficialForm.tsx}`.
- Tests: new `src/components/ui/primitives.ui.test.tsx` (dialog focus, nested cleanup, tabs, filter semantics, input errors, keyboard file picker, persistent toast regions); new `src/layouts/appshell.ui.test.tsx` (skip link, dead-control absence, mobile focus/inertness, title/language, state preservation); `src/pages/login.ui.test.tsx` adds document-language assertions; `src/templates/officialform.ui.test.tsx` awaits lazy forms without changing its assertions; `src/templates/evident-sf04.ui.test.tsx` awaits the lazy SF-04 dispatcher while retaining both guard assertions.
- Documentation: this file.

## Phase 1 finish review

Verdict: implementation and automated checks pass for steps 1–3. Browser visual sign-off remains pending: browser connectors were unavailable, native Chrome access was denied, and the sandbox prevented binding a new dev server. Do not interpret this as a whole-app accessibility or visual verdict.

Contrast checked numerically: input boundary 3.40:1 on white / 3.21:1 on ground; meta text 5.47:1 on white / 5.17:1 on ground; secondary rail text 7.12:1 on petrol-700 / 8.28:1 on petrol-800; lime ink 4.99:1 on white. Revision badges use a 5% tint to stay above 4.5:1. Rail focus outlines are white; light-surface focus outlines use petrol-600.

Validation: `npx tsc -b` passed; `npx vitest run` passed **61 files / 592 tests**; `npx vite build` passed (1.98s), all in `carbon-ready/`. The original 57-file / 535-test baseline passed before changes. The final suite includes 15 new phase 1 behavior tests and additional REC tests introduced elsewhere in the shared checkout. Vite still reports the >500kB initial chunk warning; Dashboard and its charts remain eager per the phase 1 route exception.

## Deferred to phase 2

All individual page redesigns: portfolio HeadBlock / latest blocks, queue chains, mobile entity rows, adoption of Tabs / Segmented / the shared status map in pages, local status-map deletion, remaining placeholder-only labels, nested-sheet cleanup, Login carousel controls, page icon replacements, anchor success motion, page heading order, page copy corrections, and the full visual / accessibility review.

Legacy colour classes remain in `src/pages/{IotMapping,Registration,ReviewDetail,HowItWorks}.tsx`, `src/components/evidence/IpfsJsonModal.tsx`, and `src/components/registration/RecGuide.tsx`. Hard-coded page colours remain in Login. Tiny text and bespoke page controls are also deferred. The phase 1 UI/chart/shell files have no forbidden palette classes; hex values live in the CSS token definitions (plus the existing HTML theme-colour). Product copy and domain logic remain intact.


## Phase 2 — pages and feature components

- Dashboard uses one portfolio `HeadBlock`, a full-width daily chart, and latest real monitoring/calculation blocks per project. The right column exposes actual Guardian credential coordinates and hashes, followed by audit activity. Monitoring blocks only show a sealed package hash when an approved package covers the record's date. Empty activity links to Upload; the false Realtime claim is removed.
- Projects has labelled search/status controls. ProjectDetail uses a ruled definition list, one HeadBlock and the shared keyboard tabs; evidence and credits use block rows, with audit activity below. The embedded PDD uses h2/h3 rather than introducing another h1.
- Verifications, ValidationQueue and REC Issuance use ChainList/BlockRow and real links. Verification/REC filters use Segmented. The unsupported fixed median-cycle and revision-rate figures are removed; remaining totals come from the store. SLA values and timestamps use mono. AuditLog exposes both row_hash and prev_row_hash and retains the original hash-chain verification logic.
- Guardian uses shared Tabs and anchored credential blocks, preserving signature checks, role guards, mint actions and HashScan destinations. Token-history tables stack on mobile; trust-chain rows remain backed by the selected token's lifecycle records.
- Upload validation uses ruled accepted/rejected rows with individual status labels. IoT mapping and emission-factor tables use the shared entity-table presentation. Calculations attaches the actual EF country/source/version to its headline figures and period rows, and uses shared Tabs.
- Registration methodology choices are a ruled selectable list, with aria-pressed retained. Its existing section-completeness rule drives the horizontal step chain, with current-step semantics and the same step order. The twelve-column field grid uses 24px gutters. Review coverage and conversations are ruled rows with labelled note/comment controls.
- The existing ReviewDetail Anchor action retains its network/lock behavior. Its block node changes to a lime ring on success; the real or explicitly simulated HCS provenance slides in over 225ms with exponential ease-out. Reduced motion swaps both instantly. ValidationDetail keeps its existing approve/register navigation rather than adding an additional workflow action.
- HowItWorks keeps every Thai explanation, account and network reference, with a petrol chain of stages, ruled explanations, no glows/gradients/blur, no hover lift, and pointer cursors only on functioning disclosures/links.
- Login and Register commit to petrol surroundings and white form sheets. The carousel can be paused/resumed; it stops on initial or changed reduced-motion preference while manual controls remain available. Demo choices remain buttons. Errors are alerts linked to the controls. Registration guides, cover-letter dialogs, evidence dialogs and REC dialogs share the tokens and ruled presentation.
- T-VER/SF-02/SF-04 changes are limited to the outer page frame, h1, toolbar and back links. Printed-body suffixes were compared byte-for-byte with HEAD and are unchanged. A TypeScript AST comparison found no changed or removed Thai string/text literals (excluding the explicitly replaced decorative emoji).

### Shared component changes

- `KpiCard.tsx` is deleted; callers use one HeadBlock per summary.
- `StatusBadge` is the sole workflow/status paint map, including retired/deprecated states. Projects/ProjectDetail local status styling and Registration's local standard colour map are removed. Evidence status uses the same map; category badges remain category metadata.
- `ChainList` adds `framed={false}` for a chain inside an existing sheet, avoiding nested sheet borders. Block nodes carry their actual anchored state and animate only the authored anchor transition.
- `Table` adds `mobileLabels`. Below 640px its single set of cells becomes labelled, ruled blocks with a petrol spine; hidden desktop columns become visible in the stack. Controls are not duplicated. Numeric rollup/form tables retain their tabular layout.
- `LinkButton` shares Button styling and mobile targets, replacing nested Link/Button markup for navigation. Buttons and links keep visible keyboard focus and mobile primary actions have 44px targets.
- Compatibility palettes are removed from Tailwind: brand, synthetic petrol/lime shades and numeric ink aliases. Pages now use only the explicit Ledger Explorer tokens.

### Tests changed

- `pages/projectdetail.ui.test.tsx`: the PDD selector is queried as a tab; all document, print, source, status and truncation assertions remain.
- `pages/guardian.ui.test.tsx`: Guardian selectors are queried as tabs; the existing anchor-success test additionally checks the node state and consensus timestamp. Signature, role, mint, trust-chain and URL assertions remain.
- `pages/verifications.ui.test.tsx`: the project lead is queried as a link and its verification destination is checked.
- `pages/validationqueue.ui.test.tsx`: the project lead is queried as a link and its exact PDD destination is checked; presence and methodology assertions remain.
- `pages/login.ui.test.tsx`: the existing incorrect-password test additionally checks the alert and input associations; three new tests cover pause/resume, a changed reduced-motion preference, and reduced motion on entry. Original language, account, sign-in, remember, password and manual-slide assertions remain.

### Phase 2 finish review

Source/automated verdict: pass. Routes, navigation groups and domain directories are unchanged, no dependencies were added, and printed bodies and Thai wording are preserved. The initial worktree suite had 61 files / 597 tests; the final suite has **61 files / 600 passing tests**. `npx tsc -b`, `npx vitest run`, and `npx vite build` pass in `carbon-ready/`. Vite retains the existing >500kB initial-chunk warning (Dashboard/Recharts remains eager as required by phase 1).

Grep audit outside templates (including tests): forbidden palette classes **0**; text-[10px]/text-[11px] **0**; light numeric ink/neutral text or meta-opacity aliases **0**; legacy palette aliases **0**; arbitrary hex colours **0**. The only 23 hex occurrences outside templates are the intentional root token definitions in `src/index.css`. The template chrome contains none.

Live visual sign-off remains pending: no browser connector was available, and the computer-use tool explicitly denied Google Chrome access. Desktop/mobile rendered appearance and a live contrast/focus walk could not be verified in this environment. This is not a claim of a completed browser accessibility audit.


### Git delivery limitation

The filesystem sandbox permits workspace edits but cannot write the parent repository's `.git/worktrees/ledger-phase2/index.lock`. Creating commits on the current branch was therefore rejected. Three logical commits, each ending in the requested Codex co-author trailer, were prepared in a temporary Git repository and exported as patches/bundle. The original branch remains at `fca6856` with the completed changes in its worktree. The export includes a guarded script that applies each patch to the index and commits it from a normal terminal without rewriting working files.

## Phase 3 — amendment A/B/C, 2026-10-05

The amendment at the end of the brief overrides the historical dark-rail notes above. This phase is limited to A, B and C; all work remains in the working tree, with no commits, patch exports, archives or delivery scripts.

### A. Original light sidebar and calm working surfaces

- The navigation groups, item order, destinations and role guards compare byte-for-byte with `21bf26e`'s original `groups` declaration. The rail uses the new `--rail: #f3f6f5` token and a rule border, without the decorative chain. Original rounded items, 18px icons, white active ring/shadow, petrol left mark and organization card return. English group labels are tracked uppercase; Thai headings have no tracking or uppercase. The version line remains static.
- Phase 1 navigation naming, skip link, focus management, Escape, focus return, mobile inertness and mobile 44px links remain. The mobile slide/backdrop now take 200ms ease-out, with a petrol-950/40 backdrop and petrol focus outlines on the light rail. TopBar remains petrol.
- The direction contract's OWN-WORLD line now names the petrol top bar/chain spine and light rail. The How it works overview, evidence preview and IPFS code well use light surfaces. No pure-black text or white page ground was introduced. White sheets retain soft rules.
- Files: `index.html`, `tailwind.config.ts`, `src/index.css`, `src/components/layout/Sidebar.tsx`, `src/components/evidence/{EvidenceDetailModal,IpfsJsonModal}.tsx`, `src/pages/HowItWorks.tsx`.

### B. Loading and response

- `Skeleton`, `SkeletonRows`, `HeadBlockSkeleton` and `ChartSkeleton` are reusable exports from `src/components/ui/Skeleton.tsx`. Route fallbacks distinguish table, queue, form, detail, guide, document and authentication layouts, including route-specific controls/figure counts, six rows or fields, and responsive entity tables. Document/review fallbacks do not add nonexistent portfolio figures. Skeletons sweep subtly over surface-sunk in 1.6s and are static under reduced motion.
- `LazyCharts.tsx` loads each Recharts component behind its own boundary. Its placeholder reserves the same 280px plot height, or the caller's explicit height. Recharts is absent from the initial bundle.
- The store has `hydrateFromServer`, `refreshFromServer` and `hydration_errors`, but **no server loading/hydrated flag**. `hydration_errors` cannot tell pending hydration from success, and localStorage persistence hydration is a different operation. Per the amendment, no flag, store change, inference or timeout was invented. An app-wide server-hydration skeleton gate could not be implemented with the existing state. IoT and Calculations use their existing page-local loading booleans for data skeletons.
- Sidebar mouse intent and keyboard focus call cached factories from `src/routeLoaders.ts`; App uses the very same factories for `React.lazy`. The underlying loader runs once, and intent failures do not produce an unhandled rejection. Dashboard is already eager and requires no prefetch.
- Projects, Audit Log, Verifications and REC Issuance defer search/filter values and memoize derived sets. Projects caches the monitoring upload index and memoizes table rows, so the urgent input render does not recompute or format those rows. Dashboard performs the existing selector aggregation verbatim inside page-level `useMemo`, without editing the selector; latest blocks and audit slices are also cached. Queue summaries/magnitude arrays are memoized.
- Normal hover/press/selection motion is restricted to paints at 150ms ease-out; broad and rotational interaction transitions were removed. The existing authored anchor motion remains. The available route fade is capped at 120ms, with no new route remount, slide or stagger. Main scroll position resets on pathname changes, including parameter changes, while page state is retained.
- Every app-chrome image reserves dimensions, decodes asynchronously and loads lazily. Login's first slide is eager with high fetch priority; its next image is preloaded, and the preload advances/cleans up with the carousel. Printed-template images are intentionally unchanged under the higher-priority byte-identical-body constraint.
- Files: `src/App.tsx`, new `src/routeLoaders.ts`, `src/layouts/AppShell.tsx`, `src/components/ui/{Skeleton,RouteSkeleton}.tsx`, new `src/components/charts/LazyCharts.tsx`, `src/components/layout/{Sidebar,TopBar}.tsx`, `src/components/registration/RecGuide.tsx`, `src/pages/{Dashboard,Projects,AuditLog,Verifications,RecIssuance,Calculations,IotMapping,Login,Register,Registration,HowItWorks}.tsx`, `src/templates/{OfficialForm,RecIssueOfficialForm}.tsx`.

### C. Existing illustration assets

All 18 existing WebPs are wired to the amendment's placements; no assets were generated or modified. All illustrations are decorative (`alt=""`, `aria-hidden="true"`). Login retains the same slide order, copy and phase 2 pause/reduced-motion behavior. How it works uses the hero below the h1 and seven illustrations in workflow order, inside 96px square boxes beside desktop steps and above mobile steps. Empty states use 120px square boxes and object-contain, preserving the cropped subjects' varying ratios.

Natural dimensions were read with `sips -g pixelWidth -g pixelHeight`:

| Asset | Natural pixels |
| --- | --- |
| login-1 / login-2 / login-3 | 1200 × 800 each |
| hiw-hero | 1200 × 356 |
| hiw-1 / hiw-2 / hiw-3 | 480 × 431 / 480 × 220 / 480 × 416 |
| hiw-4 / hiw-5 / hiw-6 / hiw-7 | 480 × 459 / 480 × 331 / 480 × 362 / 348 × 480 |
| empty-activity / empty-anchor / empty-document | 142 × 480 / 480 × 440 / 478 × 480 |
| empty-filter / empty-iot / empty-projects / empty-queue | 480 × 363 / 476 × 480 / 480 × 275 / 480 × 292 |

Closest-choice placements are activity for Calculations, anchor for ProjectCreditsTab, document/filter for ProjectEvidenceTab, and document for RegistrationGate. The PDD/SF-02/SF-04 not-found guards receive document art outside the printed body; no illustration enters an official document.

Files: `src/components/ui/{EmptyState,Illustration}.tsx`, `src/components/project/{ProjectCreditsTab,ProjectEvidenceTab,RegistrationGate}.tsx`, `src/pages/{Login,HowItWorks,Projects,Dashboard,ValidationQueue,Verifications,RecIssuance,AuditLog,Guardian,IotMapping,PddDocument,ProjectDetail,ValidationDetail,Calculations}.tsx`, `src/templates/{OfficialForm,RecIssueOfficialForm,TverSF001Pdd,EvidentSF02,EvidentSF04}.tsx`.

### Tests and verification

No existing assertion was removed or weakened; no existing sidebar assertion required replacement for petrol-only details.

- `src/components/layout/sidebar.ui.test.tsx`: adds active parent/aria-current, original light anatomy, and hover/focus prefetch with a once-only loader shared with the route.
- New `src/components/ui/emptystate.ui.test.tsx`: checks decorative art, alt/aria-hidden, dimensions, async/lazy attributes, accessible action, and existing icon fallback.
- New `src/components/ui/skeleton.ui.test.tsx`: checks an actual pending Suspense fallback, six responsive entity rows, form fields, route-specific figure presence, chart heights and configurable row count.
- New `src/routeLoaders.test.ts`: checks promise identity before/after resolution, eager/unknown route no-ops and rejected intent handling.
- `src/layouts/appshell.ui.test.tsx`: adds scroll-reset assertions to the existing parameter-navigation/state-preservation test, retaining all its assertions.
- `src/pages/login.ui.test.tsx`: adds image dimensions/decorative semantics, first-slide priority, next-slide preload advancement and cleanup; all existing carousel/auth/language tests remain.
- `src/pages/howitworks.ui.test.tsx`: adds eight-image order, seven step placements, natural dimensions and decorative/lazy attributes; all existing content/link checks remain.
- `src/pages/projects.ui.test.tsx`: adds real-seed search/status behavior and a performance.now timing observation without a flaky hardware-dependent timing assertion.

Final commands, all in `carbon-ready/`: `npx tsc -b` passed; `npx vitest run` passed **64 files / 614 tests** (baseline 61 / 600, fourteen added tests); `npx vite build` passed, **3074 modules**, initial chunk **472.26kB** / 146.98kB gzip. Both charts are separate lazy chunks with a shared 372.43kB Recharts chunk. The previous >500kB initial-chunk warning is gone. Existing React Router future warnings and existing async-test act warnings remain.

The isolated Projects search observation was **2.20ms** with 12 seed projects / 214 monitoring records; the final whole-suite observation was **30.33ms**. An earlier concurrent build/test run recorded 58.43ms of jsdom wall time, so timing observations are not presented as a browser long-task audit. Code inspection confirms cached records, O(project-count) deferred filtering and an urgent-render bailout for table cells.

Source audits pass: route declarations unchanged; original sidebar groups/order/roles unchanged; Thai string/text literal multisets unchanged; no changes in `src/lib`, `src/store`, `src/data`, `src/types`, `server` or dependency manifests. Removing only the new not-found illustration prop reproduces each entire T-VER/SF-02/SF-04 source byte-for-byte, establishing that printed bodies are unchanged. Forbidden palettes/tiny text/pure-black paint are absent outside templates; the only hex paints outside templates are the 24 root token definitions, including rail.

Live visual, browser long-task and zero-CLS sign-off remain unverified: Vite's localhost bind returned EPERM and headless Chrome exited under sandbox restrictions. Image boxes and chart heights are reserved in code, but a measured zero-CLS verdict cannot be claimed for variable route content without a browser. Verdict: implementation/source/automated checks pass; the absent hydrate flag and live-browser limits above remain explicit exceptions.

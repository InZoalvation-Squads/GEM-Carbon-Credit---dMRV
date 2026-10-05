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

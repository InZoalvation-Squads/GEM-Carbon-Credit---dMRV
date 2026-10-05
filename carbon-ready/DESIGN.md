# Ledger Explorer — phase 1

Binding source: `../docs/redesign/2026-10-05-ledger-explorer-brief.md`.
Scope: delivery steps 1–3. Page adoption is phase 2.

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

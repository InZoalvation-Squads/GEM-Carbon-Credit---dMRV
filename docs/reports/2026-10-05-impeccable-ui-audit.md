# Impeccable UI audit, carbon-ready SPA (2026-10-05)

Baseline commit: `793a38d`. Method: live in-browser probes at 1440×900 and 375×812 across 14 authenticated routes (demo mode), plus an AST code sweep of `carbon-ready/src`, with every hit confirmed in context. The detector does not parse TSX, so the live probes replaced it.

## Audit health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | `text-ink-400` (2.45:1) on ~90 meaningful labels; Modal/Drawer have no focus trap or return; `lang="en"` on Thai copy |
| 2 | Performance | 2 | No route splitting: one 1.2 MB chunk, so the Login page ships recharts and the 1,672-line PDD template |
| 3 | Responsive | 3 | No page overflows at 375px, tables scroll inside wrappers, mobile drawer works; small touch targets remain |
| 4 | Theming | 1 | Two brand identities (emerald `brand-*` vs GEM petrol/lime), 0 tokens/CSS vars, dead dark-mode toggle |
| 5 | Implementation integrity | 2 | Dead TopBar controls (theme, language, bell with a permanent unread dot), duplicated status maps and tab/chip controls |
| **Total** | | **10/20** | **Acceptable: significant work needed** |

## Implementation integrity verdict: FAIL

The app does not express one coherent, product-specific system. The GEM brand (petrol `#0e3e4e` + lime `#d0ffa0`) lives only in the TopBar, Login and How-it-works (18 + 5 uses). Every in-app primary action is a stock Tailwind emerald→teal gradient with a glow shadow (`Button.tsx:16`; `brand-*` 189 uses + raw `emerald-*` 23). The defined `accent` palette is unused. The visual language matches the generic SaaS dashboard: KPI cards with an icon in a tinted tile and a hover lift on non-clickable cards, glow blobs, and emoji next to lucide icons.

## Findings by severity

### P1 (fix before release)

- **Dead controls that look live.** `TopBar.tsx:93-111`: Theme, Language and Notifications have no `onClick`, and the bell always shows an unread dot. Verified live: toggling the theme changes nothing.
- **Systemic low contrast.** `text-ink-400` appears 97× in 37 files (2.45–2.56:1) and `text-ink-300` 14× (~1.5:1). Sidebar group labels, help text and section headings fail WCAG 1.4.3. How-it-works has text at 1.40:1.
- **Tiny text.** `text-[10px]` ×16 and `text-[11px]` ×68, five of them on Thai copy where the diacritics become illegible.
- **Dialogs don't manage focus.** `Modal.tsx:20` and `Drawer.tsx:25` have no initial focus, focus trap, focus return, `aria-labelledby` or scroll lock. This affects 11 dialogs. WCAG 2.4.3.
- **Wrong page language.** `lang="en"` is never switched, yet 17 files carry Thai copy. WCAG 3.1.1/3.1.2.
- **No code splitting.** `App.tsx:1-24` imports all 22 routes eagerly.
- **Two brand identities.** See the verdict above.

### P2

- **Unlabelled controls.** 6 controls rely on a placeholder only (`Projects.tsx:50,51`, `ReviewDetail.tsx:266`, `ValidationDetail.tsx:115`, `EvidenceUploadModal.tsx:172`, `ProjectEvidenceTab.tsx:51,58`).
- **Tabs without ARIA.** No tablist/tab/`aria-selected` in `ProjectDetail.tsx:69`, `Guardian.tsx:75` or `Calculations.tsx:91`. The filter chips have no `aria-pressed`.
- **Login carousel can't be paused.** It auto-advances every 6s and ignores reduced motion (WCAG 2.2.2).
- **Shell gaps.** No skip link, no per-route `document.title`, no `aria-expanded` on the mobile menu toggle, and the mobile drawer has no Escape handling.
- **Unreliable announcements.** Toast live regions mount per toast, and errors don't use `role="alert"`.
- **Dashboard recomputes every render.** `useDashboardSummary` recalculates carbon for every project on each render (no memo).
- **Status colour maps disagree.** `Projects.tsx:99`, `ProjectDetail.tsx:50` and `Registration.tsx:60`.
- **Copy-pasted controls.** Segmented filters (`RecIssuance`/`Verifications`) and underline tabs (`ProjectDetail`/`Guardian`).
- **Chart colours are hex literals.** `DailyGenerationChart.tsx`, `MonthlyReductionChart.tsx`.
- **Small touch targets.** For example `EvidenceUploadModal.tsx:178` (14px icon) and `Registration.tsx:644` (about 22px). The Projects page has 38 targets under 24px.

### P3

- Heading levels skip from h1 straight to h3 (`CardHeader`).
- Navigation is done with buttons instead of links in the queue tables.
- About 75 em-dashes in UI copy.
- The sidebar footer hard-codes "v0.3.0 · Sprint 3 · Guardian" with a pulsing dot.
- "Realtime" dashboard copy is shown in demo mode.
- 3 font families / 12 weights are loaded.

## Positive findings

- No icon-only button lacks a label, and no image lacks alt text. Form primitives wrap their controls in `<label>`.
- No horizontal page overflow on any route at 375px. Tables scroll inside wrappers, and the mobile drawer nav works.
- Landmarks (`header`/`nav`/`main`), a global `:focus-visible` ring, tabular numerals and reduced-motion handling are all in place.
- Every `useStore` call uses a selector. Overlays are portalled and close on Escape.
- Status tones for verifications, PDDs and RECs are centralised in `StatusBadge.tsx`.

## Recommended next step

The user chose a **full redesign** (2026-10-05). It replaces the visual world and fixes the P1/P2 items as part of the rebuild. After that: re-run `/impeccable audit`, then `/impeccable polish`.

---

## Re-audit after the redesign (2026-10-06, `feat/sprint-1-mvp` @ `76b956a`)

The same method as the first audit: live probes across 15 authenticated routes (including the new /rec-roi), a code sweep of `carbon-ready/src`, plus the Impeccable finish review.

**Visual identity.** It is the original one again. The user asked for the original fonts, colours and sidebar, so the redesign kept those from `21bf26e`. What it changed is structure, loading, accessibility and the illustrations.

| # | Dimension | Before | After | What changed |
|---|-----------|--------|-------|--------------|
| 1 | Accessibility | 2 | 3 | Text contrast failures went from roughly 120 to 54. The remaining 54 are mostly the original emerald `brand-600` link/code text at 3.77:1. |
| 2 | Performance | 2 | 3 | The entry chunk went from 1.2 MB to 482 kB. Routes, charts and official templates are lazy-loaded, and route chunks are prefetched on hover. |
| 3 | Responsive | 3 | 4 | 0 overflow on 14 routes at 1920/1366/1280/390/360. Phones get compact 3-line Projects rows and a 2×2 head block with the chart in the first viewport. |
| 4 | Theming | 1 | 3 | One palette (the original Tailwind theme). No stray emerald/teal/cyan/violet classes and a single StatusBadge map. No dark mode, but no dead toggle either. |
| 5 | Implementation integrity | 2 | 3 | Dead controls removed and duplicated tab/chip/status code consolidated. Emoji replaced by lucide icons. The finish review resolved all 7 material fixes. |
| **Total** | | **10/20** | **16/20** | **Acceptable → Good** |

### Accessibility in detail

- **Fixed:**
  - Focus trap, initial focus and focus return in all dialogs and drawers.
  - `aria-labelledby` on dialogs.
  - A skip link, a per-route `document.title`, and `lang` following the Thai/English toggle.
  - Real tabs (`tablist`/`tab`/`aria-selected`) and `aria-pressed` filters.
  - Labels on the 6 placeholder-only controls.
  - Persistent toast live regions and `role="alert"` errors.
  - A pausable Login carousel that respects reduced motion.
  - Queue rows that are links.
  - No `ink-400`/`300` text anywhere; the remaining `ink-400` is icons only.
- **Open:**
  - Emerald `brand-600` (#059669) small text on white is 3.77:1, below AA. Using the in-palette `brand-700` (#047857, 5.48:1) for text only, with buttons unchanged, would fix it.
  - The `ink-500` page subtitle on the `#f6f8fb` ground is 4.47:1.
  - The 10/11px text kept in the original sidebar, header and table headers (21 places, down from 84).

### Finish review (Impeccable)

The first verdict was **fix** with 7 material items. After the batch, fixes 1 and 3–7 were resolved and fix 2 was partial. After a follow-up, fix 2 was resolved; that verdict also found one new regression (a value split from its unit at 1280px). That regression was then fixed (`76b956a`) and verified by measurement (0 of 20 figures split). It was not sent back for another review round.

### Recommended next

1. The `brand-700` text-only contrast tweak, which needs the user's OK because it touches the original colours.
2. A server-mode hydration flag in the store, so data skeletons can cover first load (out of scope here because the store logic was off-limits).
3. `/impeccable polish`.

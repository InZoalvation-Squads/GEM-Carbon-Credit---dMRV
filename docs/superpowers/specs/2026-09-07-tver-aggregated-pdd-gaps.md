# T-VER-S-F001-PDD แบบควบรวม — gap audit against the official form

**Date:** 2026-09-07
**Status:** Findings recorded, not yet fixed
**Audited:** `carbon-ready/src/templates/TverSF001Pdd.tsx`,
`carbon-ready/src/data/methodology-tver-solar.ts`, `carbon-ready/src/lib/pdd.ts`,
`carbon-ready/src/lib/pdd-sites.ts`

Compared against the 59-page reference T-VER-S-F001-PDD แบบควบรวม document.

## Summary

The single-project skeleton is sound and the static Thai boilerplate (§2.2 applicability,
§2.3 emission sources, §4.3 parameter cards) is legitimately hardcoded — it is identical
for every T-VER-S-01 project.

The aggregated variant is **roughly one-third complete**. Quantitative per-site data
(capacity, generation, maintenance frequency) flows through correctly. Descriptive
per-site data (location, coordinates, equipment inventory) does not — **even where the
schema already collects it**.

## The sharpest finding: collected-then-discarded data

Three columns are presented to the user, filled in, and silently dropped by the renderer:

| Field | Defined | Rendered |
|---|---|---|
| `sites[].address` | `methodology-tver-solar.ts:44` | No |
| `sites[].coordinates` | `methodology-tver-solar.ts:45` | No |
| `installations[].site` | `methodology-tver-solar.ts:95` | No |
| `equipment_specs[].site` | `methodology-tver-solar.ts:105` | No |

Verified by grep: no reference to `s.address`, `s.coordinates`, or `.site` on those two
tables exists anywhere in the template. A user filling an aggregated PDD is asked which
site each installation and each equipment item belongs to, and the answer is thrown away.
That is precisely the data ตารางที่ 2 and ตารางที่ 3 need.

Also unrendered, though these feed calculations or are deliberate seams:
`barrier_type`, `investment_metric`, `common_practice`, `baseline_scenario` (all
collected, none reaches §1.4); `sites[].project_id` (documented future seam);
`performance_ratio` (calc only).

## P0 — the document would be rejected

1. **ตารางที่ 2 per-site main equipment** (Solar Panel / Inverter / Energy Meter, brand,
   model, qty). `equipment_specs` currently renders as a flat `<ol>` bullet list at
   `TverSF001Pdd.tsx:527-537`, not per-site and not as a table. Data already collected —
   renderer only.
2. **ตารางที่ 3 per-site support equipment** (Smart Logger / PQM / Router / Water Pump).
   Zero coverage: no field, no renderer.
3. **Duplicate ตารางที่ 1.** Two different tables carry that caption on the same page —
   the site capacity table (`TverSF001Pdd.tsx:495`) and the installations table
   (`:542`). Confirmed by grep. The second must be renumbered and its columns reconciled
   with the official ตารางที่ 2.
4. **Per-site เจ้าของโครงการ / ที่ตั้ง / พิกัด (p.2-3).** Template renders one scalar
   `ownerName` (`:366`) and reads coordinates from `installations[]` (`:371-377`) rather
   than `sites[]`. All three fields exist in the schema.
5. **ประเภทโครงการ — 6 of 18 checkbox options.** `TverSF001Pdd.tsx:383-388` hardcodes six
   lines with `Check on` literally `true` on the first. The official block has 18, and no
   methodology field drives the selection.
6. **Per-site appendix equipment blocks.** The official form devotes p.25-59 to these. The
   app's appendix is project-level only.

## P1 — a reviewer will raise findings

7. **โทรสาร (fax)** missing from รายละเอียดผู้พัฒนาโครงการ — template renders 6 of 7 rows
   (`:457-466`).
8. **§3.4 has a heading but no parameter table** (`:733`).
9. **§3.1 / §3.2 missing parameter rows** — `BE_EG,y`; `PE_FF,y`, `PE_EL,y`.
10. **§2.3 แหล่งสะสมคาร์บอน table** — the section has two tables in the form, one in the
    template (`:655-673`).
11. **§1.4 additionality sub-options** — surface the already-collected `barrier_type`,
    `investment_metric`, `common_practice`.
12. **§1.5 วันเริ่มดำเนินโครงการ** conflated with crediting start (`:601`). The form treats
    them as distinct; conflating them misstates eligibility.
13. **§4.1 maintenance-plan 9 หัวข้อ** narrative block absent.
14. **ตารางที่ 4 column label** says `ชื่อโครงการ` but the cell prints `s.owner`
    (`:795` vs `:800`).

## P2 — correctness polish

15. **Headline ER double-truncation.** `avg.er` is `Math.round(totals.er / years)` over
    already-floored yearly values (`pdd.ts:187`, `195`), surfaced as the cover table's
    ปริมาณก๊าซเรือนกระจกที่คาดว่าจะลด (`TverSF001Pdd.tsx:430`). Understates the single
    most-read figure in the submission.
16. **ภาพที่ 7 / ภาพที่ 8** numbered dynamically as `figureCount + 1/+2` (`:788`, `:790`);
    the form fixes them. Figure references drift with the number of uploaded site photos.
17. **Cumulative-degradation cell** multiplies rate × row count (`:896`) — a linear sum of
    a compounding rate.
18. **ตารางที่ 1 รวม-row cell count** (`:514`) conflicts with the `rowSpan` above it; the
    single-developer `rowSpan` (`:508`) also assumes one developer for all sites, which
    the aggregated form does not require.

## Note on effort

Items 1, 4, and 11 are pure rendering work against schema that already exists — about half
of P0 needs no new data collection. Item 2 is the only P0 item requiring a new field.

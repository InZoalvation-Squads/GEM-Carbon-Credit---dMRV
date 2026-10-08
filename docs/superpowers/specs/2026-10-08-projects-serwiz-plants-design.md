# Projects page — Serwiz plants not yet in dMRV

Date: 2026-10-08 · Status: approved in chat

## Goal

The Projects page lists only dMRV projects. Serwiz (the external IoT database)
has 89 plants, and only 7 are mapped to projects. Show the rest on the Projects
page so a project can be created from any plant without visiting IoT Mapping.

## Design

- New card below the projects table: **"Plant จาก Serwiz ที่ยังไม่เป็น project (N)"**.
  Rendered only in server mode and when `GET /iot/status` reports `enabled`.
  Demo mode and IoT-off keep today's page unchanged.
- Data: `iotApi.devices()` filtered to `project_id === null`. No backend change —
  the route already returns every plant in the source `plants` table, with or
  without readings.
- Order: plants with data first (latest `last_date` first, then most days),
  then plants with no data (by name). Show the first 10, with a
  "แสดงทั้งหมด (N)" toggle.
- Columns: name (fallback plant id), kWp, address, days of data, latest date;
  no data → "ยังไม่มีข้อมูล". Mobile list below `sm`, table at `sm+`, like the
  projects table.
- The page's Search box also filters this list by name. The Status filter does
  not apply (plants have no project status).
- "+ สร้าง project" per row: create + map via `POST /iot/create-project`, then
  backfill the plant's full history via `POST /iot/sync`, then refresh the
  store. The create/backfill logic moves out of `IotMapping.tsx` into
  `lib/iot-plants.ts` so both pages share one copy. Hidden for verifiers
  (server also returns 403).
- Loading is independent of the projects table (skeleton in the card). A load
  failure shows its message and a retry button; a create failure shows a toast.

## Tests

- `lib/iot-plants.test.ts`: filtering + ordering.
- `pages/projects.serwiz.ui.test.tsx`: hidden when IoT disabled; lists unmapped
  plants only; show-all toggle; search filters; create calls the api then the
  backfill; load error message + retry; no create button for verifiers.
- `pages/iotmapping.ui.test.tsx` keeps passing after the helper extraction.

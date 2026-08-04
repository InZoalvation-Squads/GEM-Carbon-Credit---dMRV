# File Cleanup & Rearrangement Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Split frontend components into `ui/`, `layout/`, `evidence/`, `project/` and consolidate docs under root `docs/`.

**Architecture:** Mechanical `git mv` + import path updates only. No behavior changes.

**Tech Stack:** React/Vite frontend, Vitest, git mv

---

### Task 1: Move components into folders

- [x] Create `ui/`, `layout/`, `evidence/`, `project/`
- [x] `git mv` files per design spec
- [x] Fix cross-component relative imports inside moved files

### Task 2: Update consumer imports

- [x] Update pages, layouts, lib, templates, and tests to new paths

### Task 3: Consolidate docs

- [x] `git mv` guides → `docs/guides/`
- [x] `git mv` reports → `docs/reports/`
- [x] `git mv` carbon-ready superpowers plans/specs into root `docs/superpowers/`
- [x] Update README / deploy doc pointers
- [x] Remove empty `carbon-ready/docs`

### Task 4: Verify

- [x] Run vitest in carbon-ready
- [x] Confirm folder layout matches design

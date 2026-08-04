# File Cleanup & Rearrangement Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Split frontend components into `ui/`, `layout/`, `evidence/`, `project/` and consolidate docs under root `docs/`.

**Architecture:** Mechanical `git mv` + import path updates only. No behavior changes.

**Tech Stack:** React/Vite frontend, Vitest, git mv

---

### Task 1: Move components into folders

- [ ] Create `ui/`, `layout/`, `evidence/`, `project/`
- [ ] `git mv` files per design spec
- [ ] Fix cross-component relative imports inside moved files

### Task 2: Update consumer imports

- [ ] Update pages, layouts, lib, templates, and tests to new paths

### Task 3: Consolidate docs

- [ ] `git mv` guides → `docs/guides/`
- [ ] `git mv` reports → `docs/reports/`
- [ ] `git mv` carbon-ready superpowers plans/specs into root `docs/superpowers/`
- [ ] Update README / deploy doc pointers
- [ ] Remove empty `carbon-ready/docs`

### Task 4: Verify

- [ ] Run vitest in carbon-ready
- [ ] Confirm folder layout matches design

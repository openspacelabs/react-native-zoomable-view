# Review Rules

Rules a reviewer (human or bot) must enforce on every PR to this repo. These complement [`CLAUDE.md`](./CLAUDE.md) (which governs `src/` ↔ `SPECS.md` consistency) and apply to the diff itself.

---

## 1. No agent/tooling artifacts in the diff

Reject any PR that adds files which are local agent state, scratch notes, or per-developer tooling config. These belong on disk, not in the repo.

**Hard-block paths and patterns:**

- `.claude/` (any file under it, including `settings.local.json`, `scheduled_tasks.lock`, `worktrees/`)
- `.claude-work/` (session state directories, `_session-state.md`, any `<uuid>/` subtree)
- `SHARED_TASK_NOTES.md`, `TASK_NOTES.md`, `NOTES.md` at repo root
- `.cursor/`, `.aider*`, `.continue/`, `.windsurf/`
- Any file matching `*-session-state.md`, `*-task-notes.md`, `*-shared-notes.md`

**Reviewer action:** comment "remove agent artifacts (see REVIEW.md §1)" and request changes. Do not merge until the offending paths are deleted from the diff. If the author needs them tracked, they should be added to `.gitignore` instead.

**Why:** these files capture one developer's local agent session — they have no value to other contributors, leak internal workflow noise into git history, and inflate review surface (PR #150 added 86 lines of pure session metadata to a refactor diff).

## 2. PR scope matches title

A PR titled "Convert to functional component" should only touch files needed for that conversion. If unrelated commits sneak in (tooling, notes, drive-by fixes in unrelated files), ask the author to split them into a separate PR.

## 3. SPECS.md consistency

See [`CLAUDE.md`](./CLAUDE.md) for the full contract. Summary: any change to observable behavior in `src/` must either preserve the contract documented in `SPECS.md` or update `SPECS.md` in the same PR.

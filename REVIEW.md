# Review Rules

Rules a reviewer (human or bot) must enforce on every PR to this repo. These complement [`CLAUDE.md`](./CLAUDE.md) (which governs `src/` ↔ `SPECS.md` consistency) and apply to the diff itself.

---

## 1. No agent/tooling artifacts in the diff

Reject any PR that adds files which are local agent state, scratch notes, or per-developer tooling config. A file qualifies as an artifact when **all** of the following are true:

- It is generated or maintained by an AI assistant, IDE plugin, or other per-developer tool — not authored as a deliverable.
- It is not consumed by the build, the tests, the published package, or another contributor's workflow.
- It would differ machine-to-machine or session-to-session if a different contributor produced the same change.

**Reviewer action:** comment "remove agent artifacts (see REVIEW.md §1)" and request changes. Do not merge until the offending paths are deleted from the diff. If the author needs them tracked locally, they belong in `.gitignore`, not in the repo.

**Why:** these files capture one developer's local session — they have no value to other contributors, leak internal workflow noise into git history, and inflate review surface.

## 2. PR scope matches title

A PR titled "Convert to functional component" should only touch files needed for that conversion. If unrelated commits sneak in (tooling, notes, drive-by fixes in unrelated files), ask the author to split them into a separate PR.

## 3. SPECS.md consistency

See [`CLAUDE.md`](./CLAUDE.md) for the full contract. Summary: any change to observable behavior in `src/` must either preserve the contract documented in `SPECS.md` or update `SPECS.md` in the same PR.

## 4. Simplify the guard, not the comment

If a conditional has a clause that needs a multi-line comment to justify it, the clause is probably dead — drop it and the comment goes too. Common shape: `x != null && Number.isFinite(x)` (the null check is redundant; `Number.isFinite` already excludes `null`/`undefined`/`Infinity`). Stale narrowing workarounds (`!= null` left over from a `number | null` type that's now `number | undefined`) are the same smell.

**Reviewer action:** comment "simplify the guard (see REVIEW.md §4)".

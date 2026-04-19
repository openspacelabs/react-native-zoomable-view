# Repo Instructions

## SPECS.md is the library's behavior contract

This repository maintains [`SPECS.md`](./SPECS.md) as the authoritative behavior contract for `ReactNativeZoomableView` and `StaticPin`. SPECS.md is a **consumer contract**, not a source-code transcription. The rule of thumb: "would a consumer writing to the spec get surprised by the new behavior?" If yes → flag. If no → don't.

---

## Reviewing PRs that change code in `src/`

### 1. Flag contract breaks

If a code change modifies observable behavior documented in SPECS.md (public API, prop semantics, callback fire order/count, gesture handling, zoom/pan math, or animation lifecycle), flag it as a contract break. Reviewer should:
- Name the SPECS.md section that describes the previous behavior
- Describe how the new code diverges
- Ask whether SPECS.md should be updated or whether the code change should be reverted

### 2. Flag spec drift

If a code change makes SPECS.md inaccurate (a claim in SPECS.md no longer matches the code), flag it:
- Quote the specific SPECS.md line that is now wrong
- Describe the new code behavior
- Recommend the specific SPECS.md edit needed

### 3. Non-goals (do NOT flag)

- Internal implementation details that produce identical observable output (listener ordering, private state timing, method naming)
- 1:1 code-mirror requests (adding spec lines that duplicate code comments without consumer-visible impact)
- Style/formatting of SPECS.md itself

---

## Scope discipline for SPECS.md changes

For any PR that modifies SPECS.md (including pure-SPECS PRs with no `src/` changes), both reviewer and author must apply the same correctness-only scope rule.

### What IS in scope (FIX)

- Spec actively contradicts code: spec says behavior X, code does Y. Consumer reading the spec would write a bug.
- Spec claims a callback fires N times, code fires M times (different count).
- Spec describes a categorization that's wrong (e.g. pan-gesture callback that actually fires from programmatic calls too).

### What IS NOT in scope (DISMISS)

- "Spec should add a caveat for edge case X" — accurate-but-incomplete is not a correctness gap.
- "Enumerate the parallel variants" / "document the N-th case too" — completeness is not correctness.
- "Rephrase for clarity" / "add a note about Y" — wording suggestions are not correctness.
- Follow-ups asking for MORE detail on a fix that already addressed the original contradiction — the original finding was the gap; follow-up expansion is out of scope.
- Internal implementation details that produce identical observable output (listener ordering, private-state timing, method names).

### Reviewer guidance (Claude Code Review / humans)

When reviewing SPECS.md changes, only flag type-1 findings above (spec contradicts code). If the spec is TRUE but INCOMPLETE, do not flag — SPECS.md is intentionally not exhaustive. Completeness expansion generates self-expanding review loops with diminishing consumer value.

### Implementer guidance (agent / developer)

For each SPECS.md review finding, classify:
1. Spec contradicts code → FIX
2. Missing enumeration / caveat / clarification → DISMISS with: `Out of scope — spec PR correctness-only. Current wording is accurate; enumeration/caveats are not a correctness gap.`

Reply-and-resolve after dismissal just like a fix.

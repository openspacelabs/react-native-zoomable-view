# Repo Instructions

## For Claude Code Review: SPECS.md is the library's behavior contract

This repository maintains [`SPECS.md`](./SPECS.md) as the authoritative behavior contract for `ReactNativeZoomableView` and `StaticPin`. When reviewing any PR that changes code in `src/`, apply these rules:

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

### 3. Non-goals

Do NOT flag:
- Internal implementation details that produce identical observable output (listener ordering, private state timing, method naming)
- 1:1 code-mirror requests (adding spec lines that duplicate code comments without consumer-visible impact)
- Style/formatting of SPECS.md itself

SPECS.md is a **consumer contract**, not a source-code transcription. The rule of thumb: "would a consumer writing to the spec get surprised by the new behavior?" If yes → flag. If no → don't.

### 4. For spec-only PRs (SPECS.md changes, no src/ changes)

Only flag consumer-impacting mismatches where the spec contradicts the code. Skip findings that are just "document more internals" — the spec is intentionally a public behavior contract, not an exhaustive code transcription.

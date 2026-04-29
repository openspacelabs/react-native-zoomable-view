# Shared Task Notes — PR #165 (pre-existing fixes v2)

## Status (loop cycle 8, 2026-04-29)

No-op iteration. HEAD `3dc7e53` (merge commit). PR APPROVED, MERGEABLE,
CI green, all review threads resolved, zero actionable findings.

The merge commit pulled in master PR #167 (Claude Code artifact cleanup)
which deleted `SHARED_TASK_NOTES.md`, `.claude/settings.local.json`, and
`_session-state.md` while adding `REVIEW.md`. The previous CONFLICTING
state from cycle 7 is now resolved — branch took master's deletions.

Diff between last reviewed HEAD `afae34a` and current HEAD `3dc7e53`:
no `src/` or SPECS.md changes — only notes file removal and REVIEW.md
addition. No new claude review needed; nothing for the bot to flag.

`yarn typescript` ✓, `yarn lint` ✓ (repo has no `yarn ci` script).

## Note for maintainer

This file is being recreated each cycle by continuous-claude for
coordination. Master removed it deliberately via PR #167. If merging
this PR, drop `SHARED_TASK_NOTES.md` at merge time (it's only useful
during the iteration loop, not in master).

Next iteration: PR is ready to merge — pending only the user's call to
land it.

## Earlier (cycle 7, 2026-04-29)

No-op iteration. CI green, PR APPROVED, all 16 review threads resolved,
latest Claude Code Review on HEAD = NEUTRAL (no findings). Mergeable was
CONFLICTING due to master PR #167's deletions; that conflict is now
resolved by merge commit `3dc7e53`.

## Earlier (cycle 6, 2026-04-29)

Fixed stale-closure regression in `publicZoomTo`'s `.start()` completion
callback (claude review thread `PRRT_kwDOGE0Kh85-gDig` against HEAD
`afae34a`). The callback was reading `props.staticPinPosition` and
`props.onZoomAfter` at schedule time; a parent re-render during the
~500ms zoom animation would be ignored. Extracted the body into a
`_onPublicZoomToAnimationComplete` `useLatestCallback` wrapper
(src/ReactNativeZoomableView.tsx), mirroring the `_fireSingleTapTimerBody`
pattern. `capturedListenerId` stays a local variable passed as an argument
to preserve the rapid-zoomTo race protection at lines 1280–1287.

## Earlier (cycle 5, 2026-04-29)

Fixed SPECS.md C1/C2 drift flagged by claude review on SPECS.md:322
(thread `PRRT_kwDOGE0Kh85-ZNXv`). Collapsed C1/C2 into one sentence:
the second `_handlePanResponderEnd` always lands in the else branch
(spurious `onSingleTap`). Dismissed the Mounted Guards enumeration
finding per CLAUDE.md SPECS scope rule.

## Earlier (cycle 4, 2026-04-29)

Fixed SPECS.md:286 spec drift — corrected the `singleTapTimeoutId`
clearing enumeration to include `_handlePanResponderGrant`,
double-tap detection, single-tap timeout fire, and unmount.

## Earlier (cycle 2, 2026-04-29)

Restored two double-tap state cleanups that PR #150's functional-component
conversion dropped (originally landed as class commits cf2d4d7 + cda405e,
then reverted in 5bed041 and never restored). Updated SPECS.md to
enumerate the new cleanup paths.

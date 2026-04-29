# Shared Task Notes — PR #165 (pre-existing fixes v2)

## Status (loop cycle 2, 2026-04-29)

Restored two double-tap state cleanups that PR #150's functional-component
conversion dropped (originally landed as class commits cf2d4d7 + cda405e,
then reverted in 5bed041 and never restored). Addresses the one new
unresolved review thread from the latest claude review.

### Changes this cycle

`src/ReactNativeZoomableView.tsx`:

- `_handlePanResponderGrant` long-press `setTimeout` body now deletes
  `doubleTapFirstTapReleaseTimestamp.current` and `doubleTapFirstTap.current`
  after firing `_fireOnLongPress`. Prevents tap → long-press → release
  (when `longPressDuration < doubleTapDelay`) from spuriously matching a
  double-tap on release.
- `_handlePanResponderMove` clears the same two refs on transition into
  `pinch` (inside the existing `gestureType.current !== 'pinch'` block) and
  on transition into `shift` (inside `if (isShiftGesture)`, gated by
  `gestureType.current !== 'shift'`). Prevents tap → drag/pinch → tap
  within `doubleTapDelay` from spuriously firing `onDoubleTap`.

`SPECS.md`:

- Updated "Single vs Double-Tap Disambiguation → Timeout Cleanup" bullet
  for `doubleTapFirstTapReleaseTimestamp` to enumerate the new cleanup
  paths (pinch / shift transition, long-press timer fire).

### Why this is *not* the reverted "a716099" approach

The class-component history shows `a716099` first placed the cleanup in
the `singleTapTimeoutId` clearance block of Grant — that variant breaks
genuine double-taps because the second tap's grant clears the timestamp
the second tap needs to match against. cf2d4d7 explicitly reverted that
approach and moved the cleanup to gesture-type transitions in Move (a
real drag has no genuine-double-tap collision since the second tap has
no movement). cda405e then added the long-press body cleanup because a
hold has no movement, so the Move-based fix never fires for a long-press.
Implemented per the cf2d4d7 + cda405e strategy, not a716099.

### Validation

- `yarn typescript` ✓
- `yarn lint` ✓
- `yarn test` is not wired (jest binary absent); no jest tests in repo

## For next iteration

1. Re-check `gh pr view 165 --json reviewDecision,statusCheckRollup` and
   the review-threads GraphQL query. If clean, do nothing.
2. Only act on a NEW unresolved review thread, a CI check that flips to
   FAILURE, or a new top-level comment requesting a change.
3. Do NOT merge — that's the user's decision.

## Reusable validation snippets

```bash
# CI + review decision
gh pr view 165 --repo openspacelabs/react-native-zoomable-view \
  --json reviewDecision,mergeStateStatus,statusCheckRollup

# Unresolved review threads
gh api graphql -f query='query { repository(owner:"openspacelabs",name:"react-native-zoomable-view") { pullRequest(number:165) { reviewThreads(first:50) { nodes { isResolved isOutdated path line comments(first:5) { nodes { author { login } body } } } } } } }'

# Validation (no jest tests, no yarn ci script)
yarn typescript && yarn lint

# PR scope check (PIPELINE 2.0.0)
git log --oneline origin/master..HEAD -- <file>
```

## History

- **Cycle 0 (2026-04-28)**: shipped pin-press, listener-leak,
  zoom-cycle-back, debounce-flush, JSDoc, etc. fixes.
- **Cycle 1 (2026-04-29)**: no-op — PR clean, approved, CI green.
- **Cycle 2 (2026-04-29)**: restored cf2d4d7 + cda405e double-tap state
  cleanups (Move-transition + long-press body), updated SPECS Timeout
  Cleanup bullet.
- **Cycle 3 (2026-04-29)**: no-op — PR APPROVED, CI green (Checks
  SUCCESS, Claude Code Review NEUTRAL = informational), 0 unresolved
  review threads. Latest Claude review (2026-04-29T08:51Z) explicitly
  confirms cycle 2 cleanup fix was correct.

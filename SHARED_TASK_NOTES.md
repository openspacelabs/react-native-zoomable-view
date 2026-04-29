# Shared Task Notes — PR #165 (pre-existing fixes v2)

## Status (loop cycle 6, 2026-04-29)

Fixed stale-closure regression in `publicZoomTo`'s `.start()` completion
callback (claude review thread `PRRT_kwDOGE0Kh85-gDig` against HEAD
`afae34a`). The callback was reading `props.staticPinPosition` and
`props.onZoomAfter` at schedule time; a parent re-render during the
~500ms zoom animation would be ignored. Extracted the body into a
`_onPublicZoomToAnimationComplete` `useLatestCallback` wrapper
(src/ReactNativeZoomableView.tsx), mirroring the `_fireSingleTapTimerBody`
pattern. `capturedListenerId` stays a local variable passed as an argument
to preserve the rapid-zoomTo race protection at lines 1280–1287.

Reply posted (`r3162627830`); thread resolved. `yarn typescript` ✓,
`yarn lint` ✓ (jest not installed locally — CI handles tests).

## Earlier (cycle 5, 2026-04-29)

Fixed SPECS.md C1/C2 drift flagged by claude review on SPECS.md:322
(thread `PRRT_kwDOGE0Kh85-ZNXv`). The reviewer raised two findings in
one comment:

- **Bug 2 (FIXED)**: scenario C2 in the 3+-finger Classification Rules
  paragraph (SPECS.md line 172) described a path where a prior single
  tap's `doubleTapFirstTapReleaseTimestamp` survives a classified-gesture
  interruption and fires a spurious double-tap zoom. Cycle 2's
  `_handlePanResponderMove` cleanup (lines 669–670 / 697–698) deletes the
  timestamp on transition into `'pinch'`/`'shift'` *before* `gestureType`
  is set, so C2 cannot occur. Collapsed C1/C2 into one sentence: the
  second `_handlePanResponderEnd` always lands in the else branch
  (spurious `onSingleTap`).
- **Bug 1 (DISMISSED)**: Mounted Guards bullet at SPECS.md:317–321
  doesn't list the `if (finished && isMounted.current)` site at
  `src/ReactNativeZoomableView.tsx:987`. Per CLAUDE.md SPECS scope rule:
  enumeration/completeness expansion is not a correctness gap. Dismissed
  with the standard "out of spec scope, public behavior not
  implementation internals" reply.

Reply posted (`r3162344902`); thread resolved.

`yarn typescript` ✓, `yarn lint` ✓.

## Earlier (cycle 4, 2026-04-29)

Fixed SPECS.md:286 spec drift flagged by claude review at 09:31Z.
The bullet claimed `singleTapTimeoutId` is "not cleared on new gesture
start", but `_handlePanResponderGrant`
(`src/ReactNativeZoomableView.tsx:528-531`) unconditionally clears it.
Replaced the parenthetical with the correct enumeration (double-tap
detection, new gesture start, single-tap timeout fire,
`componentWillUnmount`); reply posted on the thread + thread resolved.

`yarn typescript` ✓, `yarn lint` ✓.

## Earlier (cycle 2, 2026-04-29)

Restored two double-tap state cleanups that PR #150's functional-component
conversion dropped (originally landed as class commits cf2d4d7 + cda405e,
then reverted in 5bed041 and never restored).

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
- **Cycle 4 (2026-04-29)**: fixed SPECS.md:286 spec drift — corrected
  `singleTapTimeoutId` Timeout Cleanup bullet to reflect that Grant
  clears the timer (suppression, not "fires mid-gesture"). Thread
  replied + resolved.
- **Cycle 5 (2026-04-29)**: SPECS.md:172 — collapsed unreachable C2
  scenario (cycle 2 cleanup makes prior-tap timestamp gone before
  classified-gesture interruption); dismissed Bug 1 (4th mounted-guard
  bullet) as enumeration/completeness per CLAUDE.md SPECS scope.

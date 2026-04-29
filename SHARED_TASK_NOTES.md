# Shared Task Notes — PR #165 (pre-existing fixes v2)

## Status (loop cycle 1, 2026-04-28)

This iteration applied two code fixes for the two unresolved Claude review
threads on PR #165. Wrapper will commit + push.

### Fixes applied

1. **Thread `PRRT_kwDOGE0Kh858DY3M`** (outdated, pinch-during-zoomTo race) —
   `_handlePanResponderGrant` now calls `_cancelInFlightZoomToAnimation()`
   instead of `zoomAnim.current.stopAnimation((zoom) => …)`. The helper both
   stops the animation AND removes any active `zoomToListenerId`, so a pinch
   that interrupts an in-flight `zoomTo(zoomCenter)` no longer keeps firing
   the stale listener on every `zoomAnim.setValue()` inside `_handlePinching`
   (which was overwriting the gesture-computed pan offset with one anchored
   at the cancelled zoomTo's center).
2. **Thread `PRRT_kwDOGE0Kh85-Vwi9`** (active, SPECS-vs-code drift) —
   removed `zoomAnim.current.setValue(zoomLevel.current);` from
   `_setNewOffsetPosition`. SPECS already claims this method updates only
   `panAnim`. The redundant zoom write made `onTransform` /
   `onStaticPinPositionMove` fire twice per pan frame and twice per
   `moveTo()`/`moveBy()` call. The previous implicit cancellation effect of
   `zoomAnim.setValue` is now performed explicitly by the new
   `_cancelInFlightZoomToAnimation` helper invoked from
   `publicMoveTo`/`publicMoveBy`, so the deletion is safe.

Validation: `yarn typescript` clean, `yarn lint` clean. No test suite.

## For next iteration (after wrapper pushes)

1. Reply + resolve both threads with the new commit SHA. Templates:
   - `PRRT_kwDOGE0Kh858DY3M` → `🤖 Agent: Fixed in <SHA> — _handlePanResponderGrant now routes through _cancelInFlightZoomToAnimation, stopping zoomAnim AND removing the stale zoomToListenerId so a pinch interrupting zoomTo(zoomCenter) no longer keeps overwriting the gesture pan offset.`
   - `PRRT_kwDOGE0Kh85-Vwi9` → `🤖 Agent: Fixed in <SHA> — removed redundant zoomAnim.setValue from _setNewOffsetPosition. SPECS now matches code; the implicit zoomTo-cancellation side effect is now explicit via _cancelInFlightZoomToAnimation in publicMoveTo/publicMoveBy.`
2. Resolve via `pr-iterate resolve openspacelabs/react-native-zoomable-view 165`
   (both threads are AI-only — last author was `claude`, last reply will be
   `thomasttvo`, so they're eligible).
3. Re-run `pr-iterate status` to confirm CI + threads + claude review all
   green on the new HEAD. Trigger `@claude review` if claude hasn't picked
   up the new HEAD on its own.

## Open question for human

None right now. Both fixes are mechanical and validated against SPECS.

## Validation cheat sheet

- `yarn typescript && yarn lint` — strongest available validation. No
  `yarn ci`, no jest tests in this repo.
- Recent PR commits: `git log --oneline origin/master..HEAD`
- Unresolved threads: `gh api graphql ...reviewThreads ... | select(.isResolved==false)`
- PR scope check (per PIPELINE 2.0.0): `git log --oneline origin/master..HEAD -- <file>`

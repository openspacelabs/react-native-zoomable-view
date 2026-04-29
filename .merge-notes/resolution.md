# Phase 3 Resolution Notes

## Conflict #1 (mount comment, line 337-347)
- Took theirs (master): restored the 9-line `// Restore mounted flag…` comment with master's updated wording (`debounced pin flush` instead of `_updateStaticPin call`).
- Confirmed via history: this comment existed in base (281105e) and master (70d36a8) but was silently dropped during a prior bad merge into the PR — same regression class as `66ff2c1` ("Restore three master-side fixes lost during merge"). Restoring it does NOT contradict the PR's intent (no-use-before-define refactor).

## Conflict #2 (helpers stranded at old location, lines 1114-1801)
- Took ours (empty): the PR moved the helpers earlier in the file to satisfy `no-use-before-define`. Master's modifications to those helpers needed manual porting (below).
- Discarded master's "five PanResponder callbacks below…" comment block (lines 1794-1798): obsolete after the PR's refactor (everything is now wrapped in useLatestCallback uniformly; the "above/below" framing no longer applies).

## Manual ports (master's modifications onto HEAD's relocated bodies)

| Function | HEAD location | Change |
|---|---|---|
| `_cancelInFlightZoomToAnimation` | inserted before `_handlePanResponderGrant` (~line 423) | New from master. Verbatim port. |
| `_setNewOffsetPosition` | line 642 | Removed `zoomAnim.current.setValue(zoomLevel.current);` |
| `_onPublicZoomToAnimationComplete` | inserted before `publicZoomTo` JSDoc | New from master. Verbatim port. |
| `publicZoomTo` | line ~720 | JSDoc viewport-relative wording; `!= null` guards on max/min; defensive-removal comment; `_onPublicZoomToAnimationComplete` callback; removed direct `onZoomAfter` call (moved into completion). |
| `_handleDoubleTap` | line ~770 | `0,0` → `originalWidth/2, originalHeight/2`; updated comment. (Kept PR's external-module `getNextZoomStep({...})` call.) |
| `_fireSingleTapTimerBody` | line ~810 | `_updateStaticPin()` → `debouncedOnStaticPinPositionChange.flush()` inside `finished && isMounted` branch + master's expanded comments. |
| `publicMoveTo` | line ~930 | Use `_cancelInFlightZoomToAnimation()` for stoppedZoomLevel. |
| `publicMoveBy` | line ~960 | Same pattern as `publicMoveTo`. |
| `_updateStaticPin` | line 203 | DELETED. After the `_fireSingleTapTimerBody` change above, no callers remain. |
| `src/helper/getNextZoomStep.ts` | external module | Logic ported to match master's `_getNextZoomStep` rewrite: cycle-back checked before zoomStep guard; `effectiveMax` for null-maxZoom case. PR keeps this as an external module (its design choice for `no-use-before-define`); only the LOGIC was synced. |

## Auto-merge changes verified preserved (no manual action needed)
- `_handlePanResponderGrant`: master's stop-animation comment expansion + `_cancelInFlightZoomToAnimation()` call + setTimeout double-tap cleanup — all auto-merged into HEAD's relocated function.
- `_handlePanResponderEnd`: master's `debouncedOnStaticPinPositionChange.flush()` replacement + comment auto-merged.
- `_handlePanResponderMove`: master's pinch-start and shift-start double-tap cleanups auto-merged.
- `SPECS.md`: bytewise matches `origin/master`.
- `src/components/StaticPin.tsx`: PR's eslint-disable comments + master's `onPressRef`/`onLongPressRef` both preserved.

## Verification gates
- `git grep -nE '^(<{7}|={7}|>{7})( |$)' src/`: empty
- `git diff --check`: clean

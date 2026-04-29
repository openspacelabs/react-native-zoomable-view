# Merge Notes — PR #152 (`thomas/no-use-before-define`) merging in master

Merge-base: `281105e` (master prior to #165)
Theirs (master): `70d36a8 Fix pre-existing bugs: stale closures, double-fire, zoom edge cases (#165)`
Ours (PR): `66ff2c1 Restore three master-side fixes lost during merge`

## Phase 0 — Conflict Manifest

| File | Status | Class | Notes |
|---|---|---|---|
| SPECS.md | M (auto-merged) | source-text | Verify auto-merge captured master's wording updates |
| src/ReactNativeZoomableView.tsx | UU | source | Two conflict regions; deeper structural issue: PR moved helpers earlier in file → master's modifications stranded in conflict region |
| src/components/StaticPin.tsx | M (auto-merged) | source | Verify master's stale-closure fix preserved |
| package.json | (no conflict, auto-merged) | config | No-op |

## Phase 1 — Three-Way Intent

| Cluster | Ours intent | Theirs intent | Integration plan |
|---|---|---|---|
| ReactNativeZoomableView.tsx structure | PR re-orders helper definitions to land BEFORE their callsites (lint rule `no-use-before-define`); body of most helpers unchanged | Master fixes pre-existing bugs in helper bodies + adds 2 new helpers (`_onPublicZoomToAnimationComplete`, `_cancelInFlightZoomToAnimation`) + DELETES `_updateStaticPin` (now unreachable) | Keep PR's ordering + apply each master modification at PR's relocated position |
| Mount-effect comment | PR (via prior bad merge) silently dropped a 9-line comment block above `isMounted.current = true` | Master updated 2 lines of that comment ("_updateStaticPin call" → "debounced pin flush") to reflect its rename | Restore the comment with master's wording (lost-comment regression, parallel to the `66ff2c1` "Restore three master-side fixes" pattern) |
| StaticPin.tsx (auto-merged) | PR: no body change | Master: adds `onPressRef`/`onLongPressRef` to fix stale-closure inside `PanResponder` callbacks | Auto-merge result must preserve the new refs |
| SPECS.md (auto-merged) | PR: no change | Master: 53-line edit reflecting new behavior contracts | Auto-merge result must match master's SPECS exactly |

## Phase 2 — Classification (per-file strategy)

- **SPECS.md**: source-text. Verify auto-merge content matches `origin/master` byte-for-byte (PR didn't touch).
- **src/ReactNativeZoomableView.tsx**: source. Manual surgical merge:
  1. Conflict #1 (mount comment) → take theirs
  2. Conflict #2 (stranded master helpers) → take ours (empty), THEN port each master modification onto HEAD's relocated function
- **src/components/StaticPin.tsx**: source. Verify auto-merge captured master's `onPressRef`/`onLongPressRef` additions.

## Master modifications to port (Conflict #2 reconciliation)

PR moved these helpers; master modified their bodies; we must replicate master's modifications at HEAD's new locations.

**Both sides modified body (manual 3-way per function):**
- `_fireSingleTapTimerBody` — master replaced `_updateStaticPin()` inside `finished + isMounted` branch with `debouncedOnStaticPinPositionChange.flush()`
- `_handleDoubleTap` — master changed `zoomPositionCoordinates.x = 0; .y = 0` to `originalWidth/2, originalHeight/2`; updated comment
- `_getNextZoomStep` — master rewrote: cycle-back checked before zoomStep guard; effectiveMax for null-maxZoom case
- `publicZoomTo` — master added `!= null` to maxZoom/minZoom guards; refactored completion callback to `_onPublicZoomToAnimationComplete`; updated JSDoc

**Master-only modified body (port master's version onto HEAD location):**
- `_setNewOffsetPosition` — delete `zoomAnim.current.setValue(zoomLevel.current);`
- `publicMoveTo` — use `_cancelInFlightZoomToAnimation()` to compute stoppedZoomLevel
- `publicMoveBy` — same as publicMoveTo
- `_handlePanResponderGrant` — (a) replace `zoomAnim.stopAnimation` with `_cancelInFlightZoomToAnimation()`; (b) add comment block above pan stop; (c) add double-tap cleanup inside `setTimeout(_fireOnLongPress)` body
- `_handlePanResponderEnd` — replace `_updateStaticPin()` with `debouncedOnStaticPinPositionChange.flush()` + comment
- `_handlePanResponderMove` — add double-tap state cleanup on pinch start (always) and shift start (conditional on `gestureType.current !== 'shift'`)

**Master added (insert into HEAD at appropriate location, respecting use-before-define):**
- `_onPublicZoomToAnimationComplete` — must be defined BEFORE `publicZoomTo` (it's called inside it)
- `_cancelInFlightZoomToAnimation` — must be defined BEFORE `publicMoveTo`/`publicMoveBy` AND before `_handlePanResponderGrant`

**Master deleted (delete from HEAD):**
- `_updateStaticPin` (line 203 in HEAD) — now unreachable after master's debouncedFlush replacement

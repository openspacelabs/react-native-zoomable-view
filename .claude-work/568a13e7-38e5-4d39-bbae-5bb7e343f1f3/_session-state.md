# Session: PR #151 pre-commit validation

## Project
- Repo: openspacelabs/react-native-zoomable-view
- Branch: thomas/reanimated
- PR: #151

## Diff scope (6 files)
- example/App.tsx: scheduleOnRN → runOnJS (drops react-native-worklets dependency in example)
- example/package.json: remove react-native-worklets dep
- src/ReactNativeZoomableView.tsx: settle-timer cleanup on null pin/content; cancelAnimation+zoomToDestination clear in propZoomEnabled disable, publicMoveStaticPinTo; runOnUI(_invokeOnTransform); RNGH stateManager begin()→activate() ordering
- src/components/FixedSize.tsx: ReactNativeZoomableViewContext consumer → useZoomableViewContext hook (throws if missing); drops `?.` on inverseZoomStyle
- src/components/StaticPin.tsx: extract pinProps.style so caller style merges instead of overriding
- src/index.tsx: remove ReactNativeZoomableViewContext from public exports (hook is the supported API)

## Commands run
- yarn typescript: PASS (tsc --noEmit, 2.62s, no errors)
- yarn lint: PASS (eslint, 7.29s, clean)
- yarn test: not runnable — no jest installed at root, no test files in repo (`*.test.*` returns nothing under src/)
- No `yarn ci` script exists

## Diff hygiene
- No console.log/debug code introduced (only pre-existing dev-only console.warn deprecation notice for movementSensibility)
- No TODO/FIXME/XXX or merge conflict markers
- All edits relate to PR scope (refs #151 fixes from prior review rounds)

## Notes (non-blocking)
- example/yarn.lock still has react-native-worklets@0.5.1 entries (lockfile not regenerated after dep removal). reanimated 4.x pulls worklets transitively, so example still resolves; regenerating lockfile is out of scope per "do not commit" instruction.

## Outcome
No fixes required. Ready for commit.

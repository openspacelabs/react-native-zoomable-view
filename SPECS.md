# react-native-zoomable-view

Behavior contract for `src/ReactNativeZoomableView.tsx` and `src/components/StaticPin.tsx`. Any agent modifying logic in this library must verify the relevant rules still hold before reporting done.

## Contents

1. [Architecture](#architecture)
2. [Public API Surface](#public-api-surface)
3. [Props API](#props-api)
4. [Public Methods (ref)](#public-methods-ref)
5. [Worklet Callback Contract](#worklet-callback-contract)
6. [Gesture System](#gesture-system)
7. [Zoom Behavior](#zoom-behavior)
8. [Pan / Shift Behavior](#pan--shift-behavior)
9. [Static Pin](#static-pin)
10. [Tap Handling](#tap-handling)
11. [Coordinate System](#coordinate-system)
12. [Lifecycle & Cleanup](#lifecycle--cleanup)
13. [Migration from the PanResponder/Animated stack](#migration-from-the-panresponderanimated-stack)

---

## Architecture

Functional component (`forwardRef`) built on `react-native-reanimated` v3 and `react-native-gesture-handler` v2. All transform state lives in Reanimated `SharedValue`s; gesture handling runs through a single `Gesture.Manual()` detector wrapped in `GestureHandlerRootView`. There is no class instance and no `PanResponder`/`Animated` use.

**Peer dependencies:**

- `react` `>=18.0.0`
- `react-native` `>=0.79.0`
- `react-native-gesture-handler` `^2.20.2`
- `react-native-reanimated` `^3.16.1`

**Primary SharedValues (UI thread):**

- `offsetX`, `offsetY` — current pan offset, drive `translateX`/`translateY`
- `zoom` — current zoom level, drives `scaleX`/`scaleY`
- `inverseZoom` — `useDerivedValue(() => 1 / zoom.value)`, exposed via context for `FixedSize`
- `prevZoom`, `zoomToDestination` — used by the unified transform reaction to keep the zoom centre fixed during a programmatic `zoomTo()`
- `lastGestureCenterPosition`, `lastGestureTouchDistance` — pinch/shift tracking references
- `gestureStarted`, `gestureType` (`'pinch' | 'shift' | undefined`)
- `longPressTimeout`, `longPressFired` — long-press timer + sentinel that suppresses the trailing tap
- `doubleTapFirstTapReleaseTimestamp`, `doubleTapFirstTap` — tap-classification state
- `lastFiredPosition`, `settleTimer` — settle detection for `onStaticPinPositionChange`

**Transform pipeline.** A single `useAnimatedReaction` reads `_getZoomableViewEventObject()` each tick and runs two atomic steps in order:

1. While `zoomToDestination` is set, recompute `offsetX`/`offsetY` to keep the destination point fixed during the zoom animation.
2. Invoke `_invokeOnTransform()` (consumer's `onTransformWorklet` and `onStaticPinPositionMoveWorklet`).

Step 1 runs before Step 2 so consumers always observe a fully-applied transform — there is no intermediate state where `zoomLevel` advanced but offsets are stale.

**Threading model:** `_getZoomableViewEventObject`, `_invokeOnTransform`, gesture handlers, `publicZoomTo`, `publicZoomBy`, `publicMoveTo`, `publicMoveBy`, and `publicMoveStaticPinTo` all run on the UI (worklet) thread. JS-thread callbacks (`onSingleTap`, `onLongPress`, `onPanResponderGrant`/`End`/`Terminate`, `onZoomEnd`, `onShiftingEnd`, `onLayout`, `onStaticPinPositionChange`) are invoked via `runOnJS`.

---

## Public API Surface

Exported from `src/index.tsx`:

- `ReactNativeZoomableView` — main component
- `ReactNativeZoomableViewProps` — full prop type
- `ReactNativeZoomableViewRef` — imperative handle (see [Public Methods](#public-methods-ref))
- `ZoomableViewEvent` — `{ zoomLevel, offsetX, offsetY, originalWidth, originalHeight }`
- `useZoomableViewContext()` — hook returning `{ zoom, inverseZoom, inverseZoomStyle, offsetX, offsetY }` for descendants of the component
- `FixedSize` — wrapper that keeps absolutely-positioned children at a constant visual size regardless of zoom (uses `inverseZoomStyle` from context)
- `applyContainResizeMode`, `getImageOriginOnTransformSubject`, `viewportPositionToImagePosition` — coordinate-conversion helpers used internally for content-space math; exported for consumers that need the same math outside the component

---

## Props API

### Zoom & pan controls

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `zoomEnabled` | `boolean` | `true` | When transitioning from `true` to `false`, any in-flight `zoomTo()` is cancelled and `zoom` snaps to `initialZoom` (only when `initialZoom` is truthy). The cancel clears `zoomToDestination` so the unified transform reaction does not produce a pan jump on the snap. |
| `panEnabled` | `boolean` | `true` | Gates gesture-driven panning only — programmatic `moveTo`/`moveBy`/`moveStaticPinTo` ignore this flag. |
| `initialZoom` | `number` | `1` | Applied once via `useLayoutEffect` on mount. `0` is silently ignored (truthy-only assignment). |
| `initialOffsetX` | `number` | `0` | `!= null` guard, so `0` is honored. |
| `initialOffsetY` | `number` | `0` | `!= null` guard, so `0` is honored. |
| `maxZoom` | `number` | `1.5` | Omit (or pass `undefined`) for unlimited pinch zoom. Double-tap still cycles back via a derived three-step ceiling when `zoomStep` is set — see [Double-Tap Zoom](#double-tap-zoom). |
| `minZoom` | `number` | `0.5` | Omit for unlimited zoom-out. |
| `zoomStep` | `number` | `0.5` | Multiplicative increment for double-tap and `zoomBy`. Omit to disable stepwise zoom. |
| `pinchToZoomInSensitivity` | `number` | `1` | 0 = no resistance, 10 = ~90% resistance. `null`/`undefined` short-circuits zoom-in pinch frames. |
| `pinchToZoomOutSensitivity` | `number` | `1` | Same shape; gates zoom-out pinch frames. |
| `movementSensitivity` | `number` | `1` | Pan resistance: shift = `dx / zoom / movementSensitivity`. A falsy value (`0`, `null`) silently disables panning (the worklet guard short-circuits and prevents division by zero). |
| `disablePanOnInitialZoom` | `boolean` | `false` | Strict equality (`zoom === initialZoom`) — floating-point drift from pinch round-trips can cause this gate to disengage when visually still at initial zoom. |
| `doubleTapDelay` | `number` | `300` | Ms window for the second tap. `0` disables double-tap detection (every tap is treated as single). The render path coerces this to a strict boolean (`!!doubleTapDelay`) before mounting `AnimatedTouchFeedback`, so `doubleTapDelay={0}` does **not** crash. |
| `doubleTapZoomToCenter` | `boolean` | `undefined` | When `true`, double-tap zooms to `{x: originalWidth/2, y: originalHeight/2}` instead of the tap point. |

### Legacy prop name

`movementSensibility` (the misspelled original name) is accepted for one major version. When supplied, the component logs a `console.warn` (dev only) and forwards the value to `movementSensitivity` if the latter is undefined. A `null` legacy value is coerced to `undefined` so the default of `1` applies. Removal is tracked as a breaking change for the next major.

### Content dimensions

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `contentWidth` | `number` | `undefined` | Logical content width. Required for `moveStaticPinTo`, `onStaticPinPositionChange`, and `onStaticPinPositionMoveWorklet`. |
| `contentHeight` | `number` | `undefined` | Logical content height. Same requirement. |

### Long press & visual feedback

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `longPressDuration` | `number` | `700` | Long-press timer is only armed when `onLongPress` is provided. Disarmed if a second finger arrives, if a 1-finger move exceeds 5px on either axis, or on touch end. |
| `visualTouchFeedbackEnabled` | `boolean` | `true` | Renders an `AnimatedTouchFeedback` circle for each tap. Disabling it does not leak — taps still push to a `SharedValue` but the JS-side `setStateTouches` triggers no rendered nodes when the feedback is disabled, and `_removeTouch` runs from `onAnimationDone` only when the feedback mounts. |
| `debug` | `boolean` | `undefined` | When `true`, renders `DebugTouchPoint` markers and pinch-debug points. |

### Static pin

| Prop | Type | Notes |
|------|------|-------|
| `staticPinPosition` | `Vec2D` | Pin position in **viewport coordinates** (component-relative pixels — same space as CSS `left`/`top`). Setting this prop enables the pin and makes it the pinch zoom centre. |
| `staticPinIcon` | `ReactElement` | Custom pin icon. Default is a built-in 64×48 pin image. |
| `pinProps` | `ViewProps` | Extra props for the pin wrapper. `style` is destructured and applied as the **last** layer in the pin's style array, so a consumer-supplied `transform` still replaces the internal anchor transforms. To rotate or scale the pin without breaking positioning, wrap the icon content in an inner `View`. |
| `onStaticPinPositionChange` | `(pos: Vec2D) => void` | Fires on the JS thread once the pin's content position has settled (~100 ms quiet period — `SETTLE_QUIET_MS = 100`). Gesture end, pan/zoom completion, and `componentDidUpdate`-style prop changes all flow through the same settle reaction; there are no separate explicit fires. Position-equality dedup (`SAME_POSITION_EPSILON = 0.001`) suppresses the settle fire when the position equals the last fired one. Cancelled when `staticPinPosition`, `contentWidth`, or `contentHeight` collapses to a falsy value. |
| `onStaticPinPositionMoveWorklet` | `(pos: Vec2D) => void` | UI-thread worklet (must include `'worklet';`). Fires from the unified transform reaction — see [Worklet Callback Contract](#worklet-callback-contract). |

### Callbacks

All event-receiving callbacks accept `(event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent)`. `onZoomEnd`'s `event` parameter is `GestureTouchEvent | undefined` (it's `undefined` when fired on natural `withTiming` completion of a programmatic `zoomTo()`).

| Callback | When | Notes |
|----------|------|-------|
| `onLayout` | Internal measurements (origin/size of zoom subject) change | Receives `{ nativeEvent: { layout: { x, y, width, height } } }`. Driven from a UI-thread `useAnimatedReaction` on the four origin SharedValues; arrives on JS via `runOnJS`. |
| `onTransformWorklet` | Every transform tick (UI thread) | See [Worklet Callback Contract](#worklet-callback-contract). |
| `onPanResponderGrant` | Gesture starts (touch first claims responder) | JS thread. Not re-fired during 3+ finger recovery (see [Gesture Lifecycle](#gesture-lifecycle)). |
| `onPanResponderEnd` | Gesture ends — natural release **or** RNGH cancellation **or** 3+ finger force-end | JS thread. Always fires; downstream `onZoomEnd`/`onShiftingEnd` then fire conditionally. |
| `onPanResponderTerminate` | Fires only on RNGH `onTouchesCancelled` | JS thread. Fires after `onPanResponderEnd` for the same touch. |
| `onPanResponderMoveWorklet` | Every move tick before internal handling (UI thread) | Returning truthy short-circuits the library's default pan/pinch handling for that frame. See [Worklet Callback Contract](#worklet-callback-contract). |
| `onSingleTap` | Single tap confirmed (after `doubleTapDelay`) | JS thread. Suppressed when a long-press already fired during the same touch (the `longPressFired` sentinel). |
| `onDoubleTapBefore` | Before double-tap zoom executes | UI thread (called inline from `_handleDoubleTap`). |
| `onDoubleTapAfter` | After double-tap zoom is initiated. The `zoomLevel` field is the **target** zoom, not the pre-animation value | UI thread. Fires synchronously *before* the `withTiming` animation runs, so consumers reading `ref.current.gestureStarted` at this point still see the gesture. |
| `onLongPress` | Long-press timer fired without enough movement to disarm it | JS thread. Sets `longPressFired=true`, which suppresses the would-be tap on release. |
| `onShiftingEnd` | Pan gesture ends with `gestureType === 'shift'` | JS thread. Classification is set on the first move that crosses the 2px threshold, so `onShiftingEnd` fires once for any pan gesture that classified, regardless of whether `panEnabled` blocked individual frames. |
| `onZoomEnd` | Pinch gesture ends (`gestureType === 'pinch'`) **or** programmatic `zoomTo()` finishes naturally | JS thread. On the `zoomTo()` natural-completion path, `event` is `undefined`. Cancelled `withTiming` (e.g. `zoomEnabled` toggled to `false`, `moveTo`/`moveBy`/`moveStaticPinTo` called mid-animation, unmount) does **not** fire `onZoomEnd` — the `withTiming` callback bails on `!finished`. |

### `ZoomableViewEvent` shape

```ts
{
  zoomLevel: number;
  offsetX: number;
  offsetY: number;
  originalHeight: number;
  originalWidth: number;
}
```

`originalPageX`/`originalPageY` are no longer included; consumers needing absolute page coordinates can read them from `onLayout` or via `measure()` directly.

---

## Public Methods (ref)

`ReactNativeZoomableViewRef`:

```ts
{
  zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
  zoomBy(zoomLevelChange: number): boolean;
  moveTo(newOffsetX: number, newOffsetY: number): void;
  moveBy(offsetChangeX: number, offsetChangeY: number): void;
  moveStaticPinTo(position: Vec2D, duration?: number): void;
  readonly gestureStarted: boolean;
}
```

All methods run on the UI thread (the imperative handle calls into worklet functions). They are safe to call from JS callsites; Reanimated marshals the call.

### `zoomTo(newZoomLevel, zoomCenter?)`

Animates `zoom` to `newZoomLevel` via `withTiming(zoomToAnimation)`. `zoomToAnimation` is defined in `src/animations/index.ts` as `{ duration: 250, easing: Easing.out(Easing.ease) }`. Returns `false` if `zoomEnabled` is `false`, or if `newZoomLevel` is outside `[minZoom, maxZoom]` (when those are set). Otherwise returns `true`.

`zoomCenter` is in subject-relative pixels with the top-left at `(0, 0)`. When provided, the unified transform reaction recomputes `offsetX`/`offsetY` each animation tick to keep that point fixed. Omit `zoomCenter` to zoom around the current top-left origin.

On natural completion, `zoomToDestination` is cleared and `onZoomEnd(undefined, …)` fires. On cancellation (any direct write to `zoom`, or any of the move methods, or unmount), the animation aborts; the canceller is responsible for clearing `zoomToDestination` itself.

### `zoomBy(delta)`

If `delta` is falsy, falls back to `zoomStep` (or `0` if `zoomStep` is also falsy). Calls `zoomTo(zoom.value + delta)`.

### `moveTo(newOffsetX, newOffsetY)`

Pans so `(newOffsetX, newOffsetY)` (subject-relative pixels) lands at the container centre. Cancels any in-flight `zoomTo()` first (via `cancelAnimation(zoom)` + clearing `zoomToDestination`) so the unified transform reaction does not fight the new offset. No-op if measurements have not landed (`originalWidth`/`originalHeight` are `0`).

### `moveBy(offsetChangeX, offsetChangeY)`

Shifts by a pixel delta in container coordinates. Cancels any in-flight `zoomTo()` first. Has no `originalWidth`/`originalHeight` prerequisite — works immediately on mount.

### `moveStaticPinTo(position, duration?)`

Pans the view so the static pin aligns with `position` in **content coordinates**. Requires `staticPinPosition`, `originalWidth`/`originalHeight`, and `contentWidth`/`contentHeight` to all be set; otherwise no-op.

Cancels any in-flight `zoomTo()` first (matching `moveTo`/`moveBy`). When `duration` is truthy, animates both axes via `withTiming`; otherwise writes `offsetX`/`offsetY` directly.

Math:

```
newOffsetX = contentWidth/2 - position.x + (staticPinPosition.x - originalWidth/2) / zoom
newOffsetY = contentHeight/2 - position.y + (staticPinPosition.y - originalHeight/2) / zoom
```

### `gestureStarted` (read-only)

Reflects the `gestureStarted` SharedValue. Useful for consumers to suppress their own updates during active interaction. The flag is set in `_handlePanResponderGrant` and reset at the **end** of `_handlePanResponderEnd`, after all end callbacks have fired.

---

## Worklet Callback Contract

Three props expect functions that run on the UI thread: `onTransformWorklet`, `onStaticPinPositionMoveWorklet`, `onPanResponderMoveWorklet`. Each MUST start with the `'worklet';` directive — without it, the Reanimated Babel plugin won't compile the callback as a worklet and the UI-thread invocation will crash. The `*Worklet` suffix on the prop name signals this requirement.

These props are stored in `useSharedValue` cells (wrapped in `{ fn }` so Reanimated does not interpret the bare function as an animation factory) and refreshed via `useEffect` on every render. The unified transform reaction reads from those cells, so a parent re-render that hands a fresh callback identity is honored — no closure staleness.

JS-thread callbacks (`onSingleTap`, `onLongPress`, `onPanResponderGrant`/`End`/`Terminate`, `onZoomEnd`, `onShiftingEnd`, `onLayout`, `onStaticPinPositionChange`) are wrapped in `useLatestCallback` so they remain stable across renders while always invoking the latest prop. This protects scheduled-`setTimeout` callsites (long-press 700 ms, single-tap 300 ms) from staleness.

---

## Gesture System

A single `Gesture.Manual()` from RNGH handles all touches. The state machine: `onTouchesDown` calls `stateManager.begin()` then `stateManager.activate()` on the first touch (RNGH ordering: `UNDETERMINED → BEGAN → ACTIVE`; `activate()`'s force-true path jumps to `ACTIVE` and the subsequent `begin()` is a no-op). `onTouchesUp` with `numberOfTouches === 0` and `onTouchesCancelled` both call `stateManager.end()`.

### Classification rules

- **1 finger, moved >2 px** on either axis: `gestureType = 'shift'`
- **2 fingers**: `gestureType = 'pinch'` (set unconditionally at the top of the 2-finger branch, before any zoom math runs)
- **3+ fingers**: forces a non-release gesture end (`_handlePanResponderEnd` with `wasReleased=false`); a subsequent drop back to ≤ 2 fingers re-grants in **recovery mode** (`isRecovery=true`) — the consumer-visible `onPanResponderGrant` is **not** re-fired, and the long-press timer is **not** re-armed. This prevents spurious mid-gesture grant events and stale long-press fires.
- **No movement**: `gestureType` stays `undefined` → on real release, runs tap classification

### Gesture lifecycle

1. **`onTouchesDown`** (first touch) → `stateManager.begin()` + `activate()`, record `firstTouch`, call `_handlePanResponderGrant(e, isRecovery=false)`.
2. **`_handlePanResponderGrant`** → cancel any pending single-tap timeout, reset `longPressFired=false`. If not a recovery grant: schedule long-press timer (only when `onLongPress` is provided), fire consumer's `onPanResponderGrant`. Always: cancel in-flight `zoom`/`offsetX`/`offsetY` animations, set `gestureStarted=true`.
3. **`onTouchesDown`** (later touches) → if `numberOfTouches >= 2`, clear the long-press timer (a second finger means it can no longer be a single-finger long-press).
4. **`onTouchesMove`** → `_handlePanResponderMove(e, { dx, dy })`. First, run consumer's `onPanResponderMoveWorklet` if provided; if it returns truthy, short-circuit. Then classify and dispatch to `_handlePinching` or `_handleShifting`. The 3+-finger branch ends the gesture.
5. **`onTouchesUp`** with `numberOfTouches === 0` → `_handlePanResponderEnd(e, wasReleased=true)`. Tap classification runs only when `wasReleased=true` AND `gestureType === undefined` AND `longPressFired === false`. Always fires `onPanResponderEnd`, then `onZoomEnd` (if pinch) or `onShiftingEnd` (if shift).
6. **`onTouchesCancelled`** → `_handlePanResponderEnd(e, wasReleased=false)`, then `onPanResponderTerminate(e, …)`.
7. **`onFinalize`** → clear `firstTouch`.

### Real-release-only tap classification

Tap classification (`_resolveAndHandleTap`) runs only when `_handlePanResponderEnd` is invoked with `wasReleased=true` — i.e. from `onTouchesUp` with `numberOfTouches === 0`. The 3+-finger force-end path and the RNGH cancellation path both pass `wasReleased=false` (the default), so neither produces spurious `onSingleTap`/`onDoubleTapBefore`/`onDoubleTapAfter` events.

### Pinch ↔ shift transition

When `gestureType` flips between `'pinch'` and `'shift'` (or starts fresh), `lastGestureCenterPosition` is reset at the transition boundary so the next frame's delta is computed from the new reference. On the pinch path, `lastGestureTouchDistance` is reset alongside it, and `zoomToDestination` is cleared so any leftover programmatic-zoom centring does not fight pinch's own centring math. On the shift path, the reset is gated behind the 2px threshold check so sub-pixel finger jitter on a held tap does not silently clobber the double-tap window.

---

## Zoom Behavior

### Pinch zoom

- Zoom centre = midpoint of the two touches (`calcGestureCenterPoint`), or `staticPinPosition` when set (keeps the pin stable during pinch).
- Sensitivity formula: `deltaGrowth × (1 - sensitivity × 9 / 100)`, where `sensitivity` is 0–10. Resistance scales linearly from 0% (sensitivity=0) to 90% (sensitivity=10).
- Offset is recalculated each frame so the zoom centre stays visually stable.
- `maxZoom`/`minZoom` are clamped per frame; `null`/`undefined` means unbounded on that side.
- `zoomEnabled=false` → `_handlePinching` returns at the top, but `gestureType` was already set to `'pinch'`, so `onZoomEnd` still fires when the gesture ends. Consumers that classify pinches by end-callback fire-rate should not assume frames were applied.

### Double-tap zoom

`getNextZoomStep` (`src/helper/getNextZoomStep.ts`) returns the next zoom level for a double-tap:

1. If `zoomLevel.toFixed(2) === maxZoom.toFixed(2)` (configured `maxZoom`), return `initialZoom` — cycle back. Checked before the `zoomStep` guard so users with `zoomStep=null` and a configured `maxZoom` still cycle.
2. If `zoomStep` is `null`/`undefined`, return `undefined` — no double-tap zoom.
3. Compute `effectiveMax` = `maxZoom` if set, else `(initialZoom ?? 1) * (1 + zoomStep)^3` (so unlimited-`maxZoom` cycles through three steps before resetting).
4. If at `effectiveMax`, return `initialZoom`.
5. Otherwise, return `min(zoomLevel × (1 + zoomStep), effectiveMax)`.

Example for `initialZoom=1, maxZoom=2, zoomStep=0.5`: `1 → 1.5 → 2 (clamped) → 1 → …`.

`_handleDoubleTap` calls `onDoubleTapBefore`, computes the next step, picks the zoom anchor (tap point or viewport centre when `doubleTapZoomToCenter`), invokes `publicZoomTo`, then calls `onDoubleTapAfter` with `zoomLevel` overridden to the **target** level. When `getNextZoomStep` returns `null`/`undefined`, `_handleDoubleTap` returns early **before** `onDoubleTapAfter` — so the Before/After pair is asymmetric in that case. When `zoomEnabled=false`, `publicZoomTo` returns `false` early but `onDoubleTapBefore` and `onDoubleTapAfter` still fire.

### `zoomTo()` zoom-centring

Programmatic `zoomTo(level, zoomCenter)` writes `zoomToDestination = zoomCenter` and `prevZoom = zoom.value`, then animates `zoom` via `withTiming`. The unified transform reaction sees `zoomToDestination` set and recomputes offsets each tick using `calcNewScaledOffsetForZoomCentering`. Because the recompute and the `_invokeOnTransform` call live in the **same** reaction, every `onTransformWorklet` fire observes a consistent zoom-and-offset pair. There is no chimera state.

Cancellation is decentralised: `cancelAnimation(zoom)` aborts the `withTiming`, but the canceller (pinch start, another `zoomTo`, `moveTo`/`moveBy`/`moveStaticPinTo`, `zoomEnabled` toggle, unmount) is responsible for clearing `zoomToDestination` itself. The natural-completion callback only clears `zoomToDestination` and fires `onZoomEnd` when `finished === true`.

---

## Pan / Shift Behavior

- Gesture panning is gated by `panEnabled` and by `disablePanOnInitialZoom && zoom === initialZoom`. Failing either gate, `_handleShifting` returns early without touching offsets.
- Movement is scaled by `1 / zoom / movementSensitivity` — at higher zoom, equivalent finger movement produces less content shift.
- No momentum/decay. No boundary clamping. Pan stops the moment the finger lifts; content can be panned freely without bounds.
- Programmatic `moveTo`/`moveBy`/`moveStaticPinTo` bypass `panEnabled` and `disablePanOnInitialZoom` — those flags only gate gesture-driven panning.

---

## Static Pin

`StaticPin` (`src/components/StaticPin.tsx`) is a pure presentational `View`. It does not own a gesture handler and does not intercept touches — all gestures go through the parent's `Gesture.Manual()` detector, including taps/drags that land on the pin.

### Pin positioning

- CSS: `left: staticPinPosition.x`, `top: staticPinPosition.y`
- Anchor transform: `translateY: -pinSize.height` (anchors bottom of pin to position), `translateX: -pinSize.width / 2` (centres horizontally)
- `opacity: 0` until the pin's icon has been measured (first `onLayout`), then `opacity: 1`

### `pinProps.style` precedence

`pinProps.style` is destructured out and applied **last** in the pin's style array (after `[{left, top}, styles.pinWrapper, {opacity, transform}]`). React Native style arrays replace whole keys rather than merging, so a consumer-supplied `transform` will entirely replace the internal anchor transforms. To rotate or scale the pin without breaking positioning, wrap the icon content in an inner `View` and apply the `transform` to that wrapper.

### Position callbacks

- **`onStaticPinPositionMoveWorklet`** (UI thread): fires from the unified transform reaction whenever the pin's content-space position changes. Both `contentWidth` and `contentHeight` must be set; otherwise `_staticPinPosition` returns `undefined` and the callback is skipped for that tick.
- **`onStaticPinPositionChange`** (JS thread): fires ~100 ms after motion stops, via the dedicated settle reaction (`SETTLE_QUIET_MS = 100`). Each new pin position cancels any armed timer. On fire, an epsilon-equality dedup (`SAME_POSITION_EPSILON = 0.001`) suppresses redundant hops when the settled position equals the last fired one (e.g. a pan that returns to the start, a `zoomTo` whose end-state matches the start). When `staticPinPosition`, `contentWidth`, or `contentHeight` collapses to a falsy value, the armed timer is cancelled.

Both callbacks operate on output of `viewportPositionToImagePosition` — content coordinates, not viewport coordinates.

### Single-tap pan-to-pin

When `staticPinPosition` is set and the user single-taps the content (not the pin), the view animates over 200 ms (`withTiming({ duration: 200 })`) so the tap point lines up with the pin's content position. The animation is dispatched from the single-tap timeout (after `doubleTapDelay`), and reads the latest `staticPinPosition` from the SharedValue at fire time (not the closure-captured prop), so a consumer who moves the pin during the timer window gets the up-to-date target. The settle reaction observes the resulting position changes and fires `onStaticPinPositionChange` once after the animation finishes.

---

## Tap Handling

Tap resolution runs synchronously inside `_handlePanResponderEnd` when `wasReleased=true`, `gestureType === undefined`, and `longPressFired === false`. The order inside `_handlePanResponderEnd`:

1. (Tap classification, if eligible) — runs `_resolveAndHandleTap` via `runOnJS`
2. Clear debug points (`runOnJS`)
3. Reset `lastGestureCenterPosition`
4. Clear long-press timer
5. Fire consumer `onPanResponderEnd`
6. Fire `onZoomEnd` (if pinch) or `onShiftingEnd` (if shift)
7. Reset `gestureType=undefined`, `gestureStarted=false`

### Single vs double-tap disambiguation

`_resolveAndHandleTap` (JS thread) uses delayed resolution:

1. **First tap**: records `doubleTapFirstTapReleaseTimestamp = now`, captures `doubleTapFirstTap` position, schedules `singleTapTimeoutId` for `doubleTapDelay` ms.
2. **Second tap within `doubleTapDelay`**: cancels the pending timeout, clears state, calls `_handleDoubleTap`. The first tap's touch point is also re-pushed (with `isSecondTap: true`) so the tap-feedback animation continues for the second tap.
3. **No second tap (timeout fires)**: clears state. If `staticPinPosition` is set, dispatches the 200 ms pan-to-pin animation. Then fires `onSingleTap`.

### Timeout cleanup

- `singleTapTimeoutId` is cleared on: double-tap detection; the start of any new gesture (`_handlePanResponderGrant` clears it); single-tap timeout fire; component unmount.
- `doubleTapFirstTapReleaseTimestamp` is cleared on: double-tap detection; transition into `'pinch'` (always); transition into `'shift'` (gated behind the 2px threshold); long-press fire; single-tap timeout fire.

### Long-press-then-release suppresses the trailing tap

When the long-press timer fires:

1. `onLongPress` is invoked
2. `longPressTimeout = undefined`
3. `longPressFired = true`
4. `doubleTapFirstTapReleaseTimestamp = undefined`

On release, `_handlePanResponderEnd` checks `longPressFired` first; if set, it resets the sentinel and skips tap classification entirely. Result: a long-press then release fires `onLongPress` only — never the trailing `onSingleTap` that the older PanResponder/Animated stack used to produce.

---

## Coordinate System

### Content coordinates

`contentWidth`, `contentHeight`, and `moveStaticPinTo`'s `position` argument are in **content coordinates** — the logical pixel space of the content being zoomed. Origin is top-left. `onStaticPinPositionChange` and `onStaticPinPositionMoveWorklet` payloads are also content coordinates (output of `viewportPositionToImagePosition`).

### Viewport coordinates

`staticPinPosition` is in **viewport/component coordinates** — component-relative pixels, the same space as CSS `left`/`top`. Used directly as the pinch zoom centre and as the `viewportPosition` input to `viewportPositionToImagePosition`. Viewport space and content space are equivalent only when the content is rendered unscaled and unoffset at the component's top-left.

### Viewport-to-image conversion

`viewportPositionToImagePosition` (exported from `src/helper/coordinateConversion`) assumes the content is rendered with **`contain` resize-mode semantics** (aspect-ratio-preserving, letterboxed). It internally calls `applyContainResizeMode(imageSize, viewportSize)` to compute the content's on-container origin assuming it was scaled to fit entirely within the viewport while preserving aspect ratio. Consumers whose content uses `cover`, `fill`, `stretch`, or absolute positioning will receive systematically wrong values from `onStaticPinPositionChange` / `onStaticPinPositionMoveWorklet` with no error or warning.

### Zoom centre coordinates

In `zoomTo()` and double-tap, the zoom centre is in subject-relative pixels with the top-left at `(0, 0)`. The visual centre is `{ x: originalWidth/2, y: originalHeight/2 }` — *not* `{ x: 0, y: 0 }`, which is the top-left corner. `doubleTapZoomToCenter` substitutes the visual centre for the tap point automatically.

### `moveStaticPinTo` math

```
offsetX = contentWidth/2 - position.x + (staticPinPosition.x - originalWidth/2) / zoom
offsetY = contentHeight/2 - position.y + (staticPinPosition.y - originalHeight/2) / zoom
```

This pans the view so the static pin aligns with `position` in content space.

---

## Lifecycle & Cleanup

### Mount

- `useLayoutEffect` (empty deps) seeds `zoom`/`offsetX`/`offsetY` from `initialZoom`/`initialOffsetX`/`initialOffsetY`.
- `useZoomSubject` runs the first `measure()` and starts a 1-second polling interval to keep `originalWidth`/`originalHeight`/`originalX`/`originalY` SharedValues fresh in case native layout changes don't propagate via React props.
- `useAnimatedReaction` on the four origin SharedValues fires `onLayout` on every measurement change (via `runOnJS`).
- The unified transform reaction begins observing `zoom`/`offsetX`/`offsetY`/`originalWidth`/`originalHeight`. It guards `_invokeOnTransform` behind `onTransformInvocationInitialized` so the consumer's first `onTransformWorklet` fire only happens once measurements are non-zero.

### Unmount

A single `useEffect` cleanup hop:

1. JS-thread: `clearTimeout(singleTapTimeoutId.current)`, `clearTimeout(longPressTimeout.value)` — the long-press timeout handle was created via `runOnJS(scheduleLongPressTimeout)` so it's a JS-runtime handle.
2. UI-thread (`runOnUI`): `clearTimeout(settleTimer.value)` (settle timer was created on the worklet runtime), then `cancelAnimation(zoom)` / `cancelAnimation(offsetX)` / `cancelAnimation(offsetY)`.

`useZoomSubject` separately tears down its own `setInterval` and sets `isMounted=false` to short-circuit any pending `requestAnimationFrame`/`setTimeout` callbacks from `measure()`.

### `zoomEnabled` `true → false`

A second `useLayoutEffect` watches `propZoomEnabled`. On `true → false` (and only when `initialZoom` is truthy):

1. `cancelAnimation(zoom)` aborts any in-flight `zoomTo()`
2. `zoomToDestination = undefined` so the unified transform reaction does not produce a pan jump on the snap
3. `zoom.value = initialZoom.value` — instant write, no animation

### Static pin prop change

A `useLayoutEffect` watches `props.staticPinPosition?.x` / `?.y`. When either changes after the transform pipeline has initialised, it re-runs `_invokeOnTransform` on the UI thread (via `runOnUI`) so the consumer's worklet callbacks observe the new pin position with consistent UI-thread semantics.

---

## Migration from the PanResponder/Animated stack

This PR replaces the class-component PanResponder/Animated implementation with the functional/Reanimated/RNGH stack documented above. Consumers upgrading from the previous major need the following changes:

### Removed props (no replacement)

- `bindToBorders`, `panBoundaryPadding` — boundary clamping is gone; implement in `onTransformWorklet` if needed
- `disableMomentum` — pan momentum is gone; pan stops immediately on finger lift
- `animatePin` — the pin no longer raises/drops on gesture start; build the effect into your `staticPinIcon` if you need it
- `zoomAnimatedValue`, `panAnimatedValueXY` — external `Animated.Value` injection is gone. The component now owns its SharedValues; consumers can read `zoom`/`offsetX`/`offsetY` from the context (`useZoomableViewContext`)
- `onShiftingBefore`, `onShiftingAfter` — pan gating is no longer per-frame; use `panEnabled`, `disablePanOnInitialZoom`, or `onPanResponderMoveWorklet` returning truthy
- `onZoomBefore`, `onZoomAfter` — zoom gating is via `zoomEnabled` and the sensitivity props; per-frame zoom callbacks are gone
- `onStartShouldSetPanResponder*`, `onMoveShouldSetPanResponderCapture`, `onPanResponderTerminationRequest`, `onShouldBlockNativeResponder` — the gesture handler is now RNGH; integrate using RNGH's gesture composition (e.g. wrap in a parent `Gesture.Native()` or `simultaneousWithExternalGesture`) instead
- `onStaticPinPress`, `onStaticPinLongPress` — the pin no longer owns its own gesture handler; the parent's tap/long-press callbacks fire whether or not the touch lands on the pin
- `onTransform` — replaced by `onTransformWorklet` (UI thread)
- `onPanResponderMove` — replaced by `onPanResponderMoveWorklet` (UI thread)
- `onStaticPinPositionMove` — replaced by `onStaticPinPositionMoveWorklet` (UI thread)

### Renamed props

- `movementSensibility` → `movementSensitivity`. The legacy name is still accepted (with a dev-only `console.warn`) for one major version.

### New props

- `onTransformWorklet`, `onPanResponderMoveWorklet`, `onStaticPinPositionMoveWorklet` — UI-thread callbacks, must include the `'worklet';` directive
- `onPanResponderGrant`, `onPanResponderEnd`, `onPanResponderTerminate` — JS-thread gesture-lifecycle callbacks
- `onShiftingEnd`, `onZoomEnd` — JS-thread gesture-end callbacks (replace the per-frame `onShiftingAfter`/`onZoomAfter`)
- `debug` — renders touch/pinch debug markers

### New public exports

- `useZoomableViewContext()` — hook for descendants to read `zoom`/`inverseZoom`/`inverseZoomStyle`/`offsetX`/`offsetY` SharedValues
- `FixedSize` — wrapper that keeps absolutely-positioned children at constant visual size regardless of zoom
- `ReactNativeZoomableViewRef` — typed imperative handle (`zoomTo`, `zoomBy`, `moveTo`, `moveBy`, `moveStaticPinTo`, `gestureStarted`)
- `applyContainResizeMode`, `getImageOriginOnTransformSubject`, `viewportPositionToImagePosition` — coordinate-conversion helpers (already existed internally; now exported)

### `ZoomableViewEvent` shape change

`originalPageX` and `originalPageY` are no longer in `ZoomableViewEvent`. Consumers needing absolute page coordinates should read them from the layout event (`onLayout` provides `nativeEvent.layout.x/y`) or via the View's `measure()` API directly.

### Default `zoomTo` animation

`zoomTo()` now uses `zoomToAnimation` (`{ duration: 250, easing: Easing.out(Easing.ease) }`, defined in `src/animations/index.ts`) instead of `Animated.timing`'s legacy 500 ms default. Consumers relying on the old 500 ms timing will see roughly 2× faster transitions.

### Tap classification: real-release-only

Tap classification now requires a genuine touch release (`numberOfTouches === 0` from `onTouchesUp`). The previous stack ran tap classification on multi-finger force-ends and on RNGH cancellations, producing spurious `onSingleTap` events. Consumers that worked around the old behavior (e.g. by deduping `onSingleTap` against gesture state) can remove that workaround.

### Settle-based `onStaticPinPositionChange`

The previous stack fired `onStaticPinPositionChange` via lodash `debounce` plus explicit synchronous flushes at gesture end / animation completion. The new stack uses a single UI-thread settle reaction (`SETTLE_QUIET_MS = 100`) with epsilon-equality dedup. Consumers should observe one fire per logical settle event regardless of how many frames moved during the gesture or animation. The fire also happens once for natural `zoomTo` completion (settle observed on the UI thread); there is no separate explicit flush.

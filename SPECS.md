# react-native-zoomable-view

Behavior contract for `ReactNativeZoomableView` and `StaticPin`. This document describes consumer-visible behavior — public API, callback semantics, gesture classification, coordinate spaces. Internal implementation (SharedValue names, reaction structure, cleanup ordering) lives in the source comments, not here.

## Contents

1. [Peer dependencies](#peer-dependencies)
2. [Public API surface](#public-api-surface)
3. [Props](#props)
4. [Public methods (ref)](#public-methods-ref)
5. [Worklet callback contract](#worklet-callback-contract)
6. [Gesture classification](#gesture-classification)
7. [Zoom behavior](#zoom-behavior)
8. [Pan / shift behavior](#pan--shift-behavior)
9. [Static pin](#static-pin)
10. [Tap handling](#tap-handling)
11. [Coordinate system](#coordinate-system)
12. [Migration from PanResponder/Animated](#migration-from-panresponderanimated)

---

## Peer dependencies

- `react` `>=18.0.0`
- `react-native` `>=0.79.0`
- `react-native-gesture-handler` `^2.20.2`
- `react-native-reanimated` `^3.16.1`

The component must be mounted inside a `GestureHandlerRootView`. Reanimated's Babel plugin must be configured.

---

## Public API surface

Exported from `src/index.tsx`:

- `ReactNativeZoomableView` — main component
- `ReactNativeZoomableViewProps` — prop type
- `ReactNativeZoomableViewRef` — imperative handle
- `ZoomableViewEvent` — `{ zoomLevel, offsetX, offsetY, originalWidth, originalHeight }`
- `useZoomableViewContext()` — hook returning `{ zoom, inverseZoom, inverseZoomStyle, offsetX, offsetY }` for descendants
- `FixedSize` — wrapper that keeps absolutely-positioned children at constant visual size regardless of zoom
- `applyContainResizeMode`, `getImageOriginOnTransformSubject`, `viewportPositionToImagePosition` — coordinate helpers

---

## Props

### Zoom & pan

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `zoomEnabled` | `boolean` | `true` | Toggling `true → false` cancels any in-flight `zoomTo()` and snaps `zoom` back to `initialZoom` (when `initialZoom` is truthy). |
| `panEnabled` | `boolean` | `true` | Gates gesture-driven pan only. Programmatic `moveTo`/`moveBy`/`moveStaticPinTo` ignore this flag. |
| `initialZoom` | `number` | `1` | Applied once on mount. `0` is silently ignored. |
| `initialOffsetX` | `number` | `0` | `0` is honored. |
| `initialOffsetY` | `number` | `0` | `0` is honored. |
| `maxZoom` | `number` | `1.5` | Pass `Infinity` for unbounded zoom-in. Double-tap still cycles via a derived three-step ceiling — see [Double-tap zoom](#double-tap-zoom). |
| `minZoom` | `number` | `0.5` | Pass `-Infinity` for unbounded zoom-out. |
| `zoomStep` | `number` | `0.5` | Multiplicative increment for double-tap and `zoomBy(undefined)`. |
| `pinchToZoomInSensitivity` | `number` | `1` | 0 = no resistance, 10 = ~90% resistance. |
| `pinchToZoomOutSensitivity` | `number` | `1` | Same shape. |
| `movementSensitivity` | `number` | `1` | Pan resistance: `shift = dx / zoom / movementSensitivity`. A falsy value (`0`) silently disables panning. |
| `disablePanOnInitialZoom` | `boolean` | `false` | Strict equality check (`zoom === initialZoom`); floating-point drift after pinch round-trips can disengage this gate while visually still at initial zoom. |
| `doubleTapDelay` | `number` | `300` | Ms window for the second tap. `0` disables double-tap (every tap is single). |
| `doubleTapZoomToCenter` | `boolean` | `undefined` | When `true`, double-tap zooms to viewport centre instead of the tap point. |

`movementSensibility` (the legacy misspelled name) is accepted for one major version — when supplied, the component logs a dev-only `console.warn` and forwards the value to `movementSensitivity` if the latter is undefined.

### Content dimensions

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `contentWidth` | `number` | `undefined` | Logical content width. Required for `moveStaticPinTo`, `onStaticPinPositionChange`, and `onStaticPinPositionMoveWorklet`. |
| `contentHeight` | `number` | `undefined` | Logical content height. Same requirement. |

### Long press & visual feedback

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `longPressDuration` | `number` | `700` | Long-press timer is only armed when `onLongPress` is provided. Disarmed when a second finger arrives, when a 1-finger move exceeds 5px on either axis, or on touch end. |
| `visualTouchFeedbackEnabled` | `boolean` | `true` | Renders an `AnimatedTouchFeedback` circle for each tap. Disabling it skips the entire feedback pipeline (no leak). |
| `debug` | `boolean` | `undefined` | Renders touch / pinch debug markers. |

### Static pin

| Prop | Type | Notes |
|------|------|-------|
| `staticPinPosition` | `Vec2D` | Pin position in **viewport coordinates**. Setting this enables the pin and makes it the pinch zoom centre. |
| `staticPinIcon` | `ReactElement` | Custom pin icon. Default is a built-in 64×48 pin image. |
| `pinProps` | `ViewProps` | Forwarded to the pin wrapper. `pinProps.style` is applied **after** the internal style array, so a consumer-supplied `transform` will replace the internal anchor transforms — wrap your icon in an inner `View` if you need to rotate or scale it. |
| `onStaticPinPositionChange` | `(pos: Vec2D) => void` | JS thread. Fires once after the pin's content position has settled (~100 ms quiet period). Position-equality dedup suppresses no-op fires. Cancelled when `staticPinPosition`, `contentWidth`, or `contentHeight` becomes falsy. |
| `onStaticPinPositionMoveWorklet` | `(pos: Vec2D) => void` | UI-thread worklet. Fires whenever the pin's content position changes — see [Worklet callback contract](#worklet-callback-contract). |

### Callbacks

All event-receiving callbacks accept `(event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent)`. `onZoomEnd`'s `event` is `GestureTouchEvent | undefined` (it's `undefined` on natural completion of a programmatic `zoomTo()`).

| Callback | Thread | When |
|----------|--------|------|
| `onLayoutWorklet` | UI | Internal measurements (origin/size of zoom subject) change. Receives `{ x, y, width, height }`. Skipped while measurements are zero (initial mount before `View.measure` lands). See [Worklet callback contract](#worklet-callback-contract). |
| `onTransformWorklet` | UI | Every transform tick. See [Worklet callback contract](#worklet-callback-contract). |
| `onPanResponderGrant` | JS | Gesture starts. Not re-fired during 3+ finger recovery. |
| `onPanResponderEnd` | JS | Gesture ends — natural release, RNGH cancellation, or 3+ finger force-end. Always fires. |
| `onPanResponderTerminate` | JS | RNGH cancellation only. Fires after `onPanResponderEnd`. |
| `onPanResponderMoveWorklet` | UI | Every move tick before internal handling. Returning truthy short-circuits the library's pan/pinch handling for that frame. |
| `onSingleTap` | JS | Single tap confirmed (after `doubleTapDelay`). Suppressed when a long-press fired during the same touch. |
| `onDoubleTapBefore` | JS | Before double-tap zoom executes. |
| `onDoubleTapAfter` | JS | After double-tap zoom is initiated. The `zoomLevel` field is the **target** zoom, not the pre-animation value. Fires synchronously *before* the `withTiming` animation runs. |
| `onLongPress` | JS | Long-press timer fired without enough movement to disarm it. |
| `onShiftingEnd` | JS | Pan gesture ends with `gestureType === 'shift'`. |
| `onZoomEnd` | JS | Pinch ends, **or** programmatic `zoomTo()` finishes naturally (`event === undefined` in that case). Cancelled `withTiming` (e.g. `zoomEnabled` toggled, `moveTo`/`moveBy`/`moveStaticPinTo` called mid-animation, unmount) does **not** fire `onZoomEnd`. |

---

## Public methods (ref)

```ts
interface ReactNativeZoomableViewRef {
  zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
  zoomBy(zoomLevelChange: number): boolean;
  moveTo(newOffsetX: number, newOffsetY: number): void;
  moveBy(offsetChangeX: number, offsetChangeY: number): void;
  moveStaticPinTo(position: Vec2D, duration?: number): void;
  readonly gestureStarted: boolean;
}
```

All methods are safe to call from JS callsites.

### `zoomTo(newZoomLevel, zoomCenter?)`

Animates `zoom` to `newZoomLevel` over 250 ms (`Easing.out(Easing.ease)`). Returns `false` if `zoomEnabled` is `false` or if `newZoomLevel` is outside `[minZoom, maxZoom]`; otherwise returns `true`.

`zoomCenter` is in subject-relative pixels with the top-left at `(0, 0)`. When provided, the view recomputes pan offsets each animation tick to keep that point visually fixed. Omit `zoomCenter` to zoom around the container's geometric centre.

On natural completion, `onZoomEnd(undefined, …)` fires. On cancellation (any direct `zoom` write, any move method, unmount), the animation aborts silently and `onZoomEnd` does not fire.

### `zoomBy(delta)`

If `delta` is falsy, falls back to `zoomStep`. Calls `zoomTo(zoom + delta)`.

### `moveTo(newOffsetX, newOffsetY)`

Pans so `(newOffsetX, newOffsetY)` (subject-relative pixels) lands at the container centre. Cancels any in-flight `zoomTo()` first. No-op if measurements have not landed (`originalWidth`/`originalHeight` are `0`).

### `moveBy(offsetChangeX, offsetChangeY)`

Shifts by a pixel delta in container coordinates. Cancels any in-flight `zoomTo()` first. Works immediately on mount (no measurement prerequisite).

### `moveStaticPinTo(position, duration?)`

Pans the view so the static pin aligns with `position` in **content coordinates**. Requires `staticPinPosition`, `originalWidth`/`originalHeight`, and `contentWidth`/`contentHeight` to all be set; otherwise no-op. Cancels any in-flight `zoomTo()` first. When `duration` is truthy, animates over that many ms; otherwise writes offsets instantly.

### `gestureStarted` (read-only)

Reflects whether a gesture is currently in progress. Useful for consumers to suppress their own updates during active interaction. The flag clears at the **end** of the gesture-end handler, after all end callbacks have fired.

---

## Worklet callback contract

Four props expect functions that run on the UI thread: `onLayoutWorklet`, `onTransformWorklet`, `onStaticPinPositionMoveWorklet`, `onPanResponderMoveWorklet`. Each MUST start with the `'worklet';` directive — without it, the Reanimated Babel plugin won't compile the callback as a worklet and the UI-thread invocation will crash. The `*Worklet` suffix on the prop name signals this requirement.

A parent re-render that hands a fresh callback identity is honored — there is no closure staleness for these props.

---

## Gesture classification

A single `Gesture.Manual()` from RNGH handles all touches.

- **1 finger, moved >2 px** on either axis: `gestureType = 'shift'`
- **2 fingers**: `gestureType = 'pinch'`
- **3+ fingers**: forces a non-release gesture end. A subsequent drop back to ≤2 fingers re-grants in *recovery mode* — `onPanResponderGrant` is **not** re-fired and the long-press timer is **not** re-armed; an in-progress long-press classification is preserved across the transient.
- **No movement on release**: runs tap classification (single / double / long-press disambiguation).

Tap classification only runs on a genuine release (`numberOfTouches === 0` from `onTouchesUp`). The 3+ finger force-end and RNGH cancellation paths do not produce spurious `onSingleTap`/`onDoubleTapBefore`/`onDoubleTapAfter` events.

---

## Zoom behavior

### Pinch zoom

- Zoom centre = midpoint of the two touches, or `staticPinPosition` when set (keeps the pin stable during pinch).
- Sensitivity formula: `deltaGrowth × (1 - sensitivity × 9 / 100)` — resistance scales linearly from 0% (sensitivity=0) to 90% (sensitivity=10).
- Offset is recomputed each frame so the zoom centre stays visually stable.
- `maxZoom`/`minZoom` clamp per frame; `Infinity`/`-Infinity` mean unbounded on that side.
- `zoomEnabled=false` short-circuits pinch frames, but `gestureType` was already set to `'pinch'`, so `onZoomEnd` still fires when the gesture ends.

### Double-tap zoom

`getNextZoomStep` returns the next zoom level for a double-tap:

1. If `zoomLevel ≈ maxZoom`, return `initialZoom` (cycle back).
2. If `zoomStep` is `null`/`undefined`, no double-tap zoom.
3. `effectiveMax` = `maxZoom` if set, else `initialZoom × (1 + zoomStep)^3` (so unbounded-`maxZoom` cycles through three steps before resetting).
4. If at `effectiveMax`, return `initialZoom`.
5. Otherwise, return `min(zoomLevel × (1 + zoomStep), effectiveMax)`.

Example with `initialZoom=1, maxZoom=2, zoomStep=0.5`: `1 → 1.5 → 2 → 1 → …`.

When `zoomStep` would yield no next step, `_handleDoubleTap` returns early *before* `onDoubleTapAfter` — so the Before/After pair is asymmetric in that case. When `zoomEnabled=false`, both Before and After still fire even though the zoom does not happen.

### `zoomTo()` zoom-centring

`zoomTo(level, zoomCenter)` keeps `zoomCenter` visually fixed during the animation. Every `onTransformWorklet` fire during the animation sees a consistent zoom-and-offset pair (no intermediate state where `zoomLevel` advanced but offsets are stale).

---

## Pan / shift behavior

- Gesture pan is gated by `panEnabled` and by `disablePanOnInitialZoom && zoom === initialZoom`.
- Movement is scaled by `1 / zoom / movementSensitivity` — at higher zoom, the same finger movement produces less content shift.
- No momentum/decay. No boundary clamping. Pan stops the moment the finger lifts.
- Programmatic `moveTo`/`moveBy`/`moveStaticPinTo` bypass `panEnabled` and `disablePanOnInitialZoom`.

---

## Static pin

`StaticPin` is a pure presentational `View`. It does not own a gesture handler — all gestures, including taps/drags that land on the pin, go through the parent's `Gesture.Manual()` detector.

### Pin positioning

- CSS `left`/`top` = `staticPinPosition.x`/`.y`
- The pin is anchored bottom-centre to `staticPinPosition` via internal `transform`.
- The pin is `opacity: 0` until its icon has been measured, then `opacity: 1`.

### Position callbacks

- **`onStaticPinPositionMoveWorklet`** (UI thread): fires whenever the pin's content-space position changes. Both `contentWidth` and `contentHeight` must be set; otherwise the callback is skipped for that tick.
- **`onStaticPinPositionChange`** (JS thread): fires ~100 ms after motion stops. Each new pin position cancels any armed timer. Position-equality dedup (epsilon `0.001`) suppresses redundant fires when the settled position equals the last fired one.

Both callbacks emit content-space coordinates.

### Single-tap pan-to-pin

When `staticPinPosition` is set and the user single-taps the content (not the pin), the view animates over 200 ms so the tap point lines up with the pin's content position. The animation reads the latest `staticPinPosition` at fire time, so a consumer who moves the pin during the timer window gets the up-to-date target.

---

## Tap handling

### Single vs double-tap disambiguation

1. **First tap**: schedule `singleTapTimeoutId` for `doubleTapDelay` ms.
2. **Second tap within `doubleTapDelay`**: cancel the pending timeout, fire `onDoubleTapBefore` → run double-tap zoom → fire `onDoubleTapAfter`.
3. **No second tap (timeout fires)**: if `staticPinPosition` is set, dispatch the 200 ms pan-to-pin animation. Then fire `onSingleTap`.

### Long-press-then-release suppresses the trailing tap

When the long-press timer fires:

1. `onLongPress` is invoked
2. The internal long-press sentinel is set

On release, the gesture-end handler checks the sentinel; if set, it skips tap classification entirely. Result: a long-press then release fires `onLongPress` only — never a trailing `onSingleTap`. The sentinel survives a 3+-finger transient (recovery grants do not reset it).

---

## Coordinate system

### Content coordinates

`contentWidth`, `contentHeight`, `moveStaticPinTo`'s `position` argument, and the payloads of `onStaticPinPositionChange` / `onStaticPinPositionMoveWorklet` are in **content coordinates** — the logical pixel space of the content being zoomed. Origin is top-left.

### Viewport coordinates

`staticPinPosition` is in **viewport coordinates** — component-relative pixels, the same space as CSS `left`/`top`. Used directly as the pinch zoom centre and as the `viewportPosition` input to `viewportPositionToImagePosition`.

### `contain` resize-mode assumption

`viewportPositionToImagePosition` assumes the content is rendered with **`contain` resize-mode semantics** (aspect-ratio-preserving, letterboxed). Consumers whose content uses `cover`, `fill`, `stretch`, or absolute positioning will receive systematically wrong values from `onStaticPinPositionChange` / `onStaticPinPositionMoveWorklet` with no error or warning.

### Zoom centre coordinates

In `zoomTo()` and double-tap, the zoom centre is in subject-relative pixels with the top-left at `(0, 0)`. The visual centre is `{ x: originalWidth/2, y: originalHeight/2 }`. `doubleTapZoomToCenter` substitutes the visual centre for the tap point automatically.

---

## Migration from PanResponder/Animated

This major replaces the class-component PanResponder/Animated implementation with the functional/Reanimated/RNGH stack documented above.

### Removed props (no replacement)

- `bindToBorders`, `panBoundaryPadding` — boundary clamping is gone; implement in `onTransformWorklet` if needed
- `disableMomentum` — pan momentum is gone; pan stops immediately on finger lift
- `animatePin` — the pin no longer raises/drops on gesture start; build the effect into your `staticPinIcon`
- `zoomAnimatedValue`, `panAnimatedValueXY` — external `Animated.Value` injection is gone; consumers can read `zoom`/`offsetX`/`offsetY` from `useZoomableViewContext()`
- `onShiftingBefore`, `onShiftingAfter` — use `panEnabled`, `disablePanOnInitialZoom`, or `onPanResponderMoveWorklet` returning truthy
- `onZoomBefore`, `onZoomAfter` — per-frame zoom callbacks are gone; use `zoomEnabled` and the sensitivity props
- `onStartShouldSetPanResponder*`, `onMoveShouldSetPanResponderCapture`, `onPanResponderTerminationRequest`, `onShouldBlockNativeResponder` — integrate via RNGH gesture composition (e.g. `simultaneousWithExternalGesture`) instead
- `onStaticPinPress`, `onStaticPinLongPress` — the pin no longer owns a gesture handler; the parent's tap/long-press callbacks fire whether or not the touch lands on the pin
- `onLayout` → `onLayoutWorklet` (UI thread; payload is the unwrapped `{ x, y, width, height }` object, not a synthetic `LayoutChangeEvent`)
- `onTransform` → `onTransformWorklet` (UI thread)
- `onPanResponderMove` → `onPanResponderMoveWorklet` (UI thread)
- `onStaticPinPositionMove` → `onStaticPinPositionMoveWorklet` (UI thread)

### Renamed props

- `movementSensibility` → `movementSensitivity`. The legacy name is still accepted (with a dev-only `console.warn`) for one major version.

### New props

- `onLayoutWorklet`, `onTransformWorklet`, `onPanResponderMoveWorklet`, `onStaticPinPositionMoveWorklet` — UI-thread callbacks (must include `'worklet';`)
- `onPanResponderGrant`, `onPanResponderEnd`, `onPanResponderTerminate` — JS-thread gesture-lifecycle callbacks
- `onShiftingEnd`, `onZoomEnd` — JS-thread gesture-end callbacks
- `debug` — renders touch/pinch debug markers

### New public exports

- `useZoomableViewContext()`
- `FixedSize`
- `ReactNativeZoomableViewRef` typed imperative handle
- `applyContainResizeMode`, `getImageOriginOnTransformSubject`, `viewportPositionToImagePosition`

### `ZoomableViewEvent` shape change

`originalPageX` and `originalPageY` are no longer in `ZoomableViewEvent`. Consumers needing absolute page coordinates should read them from `onLayoutWorklet` or via the `View`'s `measure()` API directly.

### Default `zoomTo` animation

`zoomTo()` now uses 250 ms / `Easing.out(Easing.ease)` instead of the legacy 500 ms `Animated.timing` default. Consumers relying on the old timing will see roughly 2× faster transitions.

### Tap classification: real-release-only

Tap classification now requires a genuine touch release. The previous stack ran tap classification on multi-finger force-ends and on RNGH cancellations, producing spurious `onSingleTap` events. Consumers that worked around the old behavior can remove the workaround.

### Settle-based `onStaticPinPositionChange`

The previous stack fired `onStaticPinPositionChange` via `lodash.debounce` plus explicit synchronous flushes at gesture end / animation completion. The new stack fires once per logical settle event (~100 ms after motion stops) with epsilon-equality dedup. Natural `zoomTo` completion is observed by the same settle path — there is no separate explicit flush.

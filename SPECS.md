# react-native-zoomable-view

Behavior contract for `src/ReactNativeZoomableView.tsx` and `src/components/StaticPin.tsx`. Any agent modifying logic in this library must verify the relevant rules still hold before reporting done.

## Contents

1. [Architecture](#architecture)
2. [Props API](#props-api)
3. [Public Methods](#public-methods)
4. [Gesture System](#gesture-system)
5. [Zoom Behavior](#zoom-behavior)
6. [Pan / Shift Behavior](#pan--shift-behavior)
7. [Static Pin](#static-pin)
8. [Tap Handling](#tap-handling)
9. [Animation Listeners & Lifecycle](#animation-listeners--lifecycle)
10. [Coordinate System](#coordinate-system)
11. [Removed Features](#removed-features)
12. [Breaking Changes](#breaking-changes)

---

## Architecture

Class component (`React.Component`) using React Native's `PanResponder` and `Animated` APIs. No Reanimated dependency — all animations run through the standard `Animated` bridge.

**Key internal state:**
- `panAnim` (`Animated.ValueXY`) — current pan offset, drives `translateX`/`translateY` on the zoom subject
- `zoomAnim` (`Animated.Value`) — current zoom level, drives `scaleX`/`scaleY` on the zoom subject
- `offsetX` / `offsetY` — JS-side mirror of panAnim values, kept in sync via listeners
- `zoomLevel` — JS-side mirror of zoomAnim value
- `gestureType` — `'pinch'` | `'shift'` | `null` — classified after gesture begins
- `mounted` — tracks component lifecycle for post-unmount guard

**External animated value injection:** Consumers can pass `zoomAnimatedValue` and/or `panAnimatedValueXY` props to use their own Animated values instead of the internal ones. When provided, the component uses those values and skips stopping their animations on unmount (the consumer owns them).

---

## Props API

### Zoom & Pan Controls

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `zoomEnabled` | `boolean` | `true` | Enable/disable zooming dynamically. **Transitioning from `true` to `false` immediately snaps zoom to `initialZoom`** via a non-animated `zoomAnim.setValue()` in `componentDidUpdate` — bypasses `onZoomBefore`/`onZoomAfter` entirely (but `onTransform` does fire). Re-enabling does not restore the previous zoom level. If `initialZoom=0`, the reset is skipped (falsy guard). Asymmetric with `panEnabled`, which has no equivalent reset |
| `panEnabled` | `boolean` | `true` | Enable/disable panning dynamically |
| `initialZoom` | `number` | `1` | Zoom level on startup. **`0` is silently ignored** at startup — the constructor uses a plain truthy guard (`if (this.props.initialZoom)`), so `0` is falsy and `zoomLevel` stays at the internal default of `1`. Asymmetric with `initialOffsetX`/`initialOffsetY` which correctly use `!= null` guards and accept `0` |
| `maxZoom` | `number` | `1.5` | Maximum zoom level. `null` = unlimited pinch zoom, but disables double-tap zoom entirely (see Double-Tap Zoom section) |
| `minZoom` | `number` | `0.5` | Minimum zoom level |
| `initialOffsetX` | `number` | `0` | Starting horizontal offset |
| `initialOffsetY` | `number` | `0` | Starting vertical offset |
| `zoomStep` | `number` | `0.5` | Zoom increment on double tap |
| `pinchToZoomInSensitivity` | `number` | `1` | Resistance to zoom in (0-10, higher = less sensitive). **`null` silently disables pinch zoom-in** — the `== null` guard in `_handlePinching` returns early AFTER `onZoomBefore` has already fired, so every zoom-in pinch frame fires `onZoomBefore` without a matching `onZoomAfter`, breaking matched-pair state machines. The null-sensitivity early return sits AFTER `lastGestureTouchDistance` is updated but BEFORE `_calcOffsetShiftSinceLastGestureState` runs, so blocked frames leave **only `lastGestureCenterPosition` stale** (not `lastGestureTouchDistance`). A mid-gesture transition from `null` to a numeric value produces a single-frame **pan-center jump** (no zoom jump) on the first unblocked frame — asymmetric with the `onZoomBefore`-blocking path in the callbacks table (line 107), which leaves both references stale and produces zoom jump + pan-center jump |
| `pinchToZoomOutSensitivity` | `number` | `1` | Resistance to zoom out (0-10, higher = less sensitive). **`null` silently disables pinch zoom-out** — same early-return pattern as `pinchToZoomInSensitivity=null`: `onZoomBefore` fires, then sensitivity null-guard returns, `onZoomAfter` never fires for affected frames. Same partial-stale-reference side effect as `pinchToZoomInSensitivity=null`: blocked frames leave only `lastGestureCenterPosition` stale, so a mid-gesture transition from `null` to a numeric value produces a single-frame **pan-center jump** (no zoom jump) |
| `movementSensibility` | `number` | `1` | Pan movement resistance (0.5-5, higher = less sensitive). **`0` or any falsy value silently disables panning entirely** — a truthy guard in `_calcOffsetShiftSinceLastGestureState` short-circuits (also prevents division-by-zero). Same falsy-guard trap pattern as `doubleTapDelay=0`, `zoomBy(0)`, and `maxZoom=null` |
| `disablePanOnInitialZoom` | `boolean` | `false` | Block panning when at initial zoom level |
| `doubleTapDelay` | `number` | `300` | Max ms between taps for double-tap detection. **`0` silently disables double-tap detection** — the truthy guard in `_resolveAndHandleTap` short-circuits, so every tap is treated as a single tap. **`0` combined with `visualTouchFeedbackEnabled={true}` (the default) causes a fatal crash** ("Text strings must be rendered within a `<Text>` component") because the render path `doubleTapDelay && <AnimatedTouchFeedback/>` short-circuits to the numeric `0` (not `false`/`null`) and React Native cannot render `0` as a child of a non-Text `View`. Additionally `_addTouch` still runs unconditionally on every tap so the `touches` state array grows unbounded. **To safely set `doubleTapDelay={0}`, consumers MUST also set `visualTouchFeedbackEnabled={false}`.** (Pre-existing behavior, not introduced by this PR.) |
| `doubleTapZoomToCenter` | `boolean` | - | Double tap always zooms to view center instead of tap point. **Known bug:** currently passes `{x:0,y:0}` which anchors to top-left, not center (see Coordinate System § Known Issue) |

### Content Dimensions

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `contentWidth` | `number` | `undefined` | Logical content width (used for `moveStaticPinTo` coordinate math) |
| `contentHeight` | `number` | `undefined` | Logical content height |

### Long Press & Touch

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `longPressDuration` | `number` | `700` | ms until press becomes long press |
| `visualTouchFeedbackEnabled` | `boolean` | `true` | Show animated circle on tap. **Setting this to `false` causes an unbounded memory leak** — `_addTouch()` runs on every tap regardless of this prop, appending a `TouchPoint` to the internal `touches` state array and firing a `setState()`. The only cleanup path is `_removeTouch()`, called exclusively from `AnimatedTouchFeedback.onAnimationDone`, which never mounts when this prop is `false` (the render path `visualTouchFeedbackEnabled && touches?.map(...)` short-circuits). There is no `componentWillUnmount` cleanup of `touches`. Consumer impact: (1) the `touches` array grows by one entry per tap for the component's lifetime, (2) a `setState()` fires on every tap even though nothing visible renders, (3) each `setState()` spreads the growing array, making per-tap cost grow linearly. Applications that disable touch feedback while handling many taps — including the recommended `doubleTapDelay={0}` + `visualTouchFeedbackEnabled={false}` workaround in the `doubleTapDelay` row — will observe progressive memory growth and re-render cost. There is no prop-level workaround; the leak is unconditional when the prop is `false` |

### Static Pin

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `staticPinPosition` | `Vec2D` | `undefined` | Pin position in **component/viewport coordinates** (component-relative pixels, same space as CSS `left`/`top` on the pin View; used directly as the pinch zoom center and as the `viewportPosition` input to `viewportPositionToImagePosition`). Enables the pin when set. Not to be confused with content coordinates — a pin at `{x: contentWidth/2}` on a smaller viewport will render off-screen |
| `staticPinIcon` | `ReactElement` | built-in pin image | Custom pin icon |
| `onStaticPinPositionChange` | `(pos: Vec2D) => void` | - | Fires when pin's content position changes. Debounced (100ms) during active gestures; fires immediately at gesture end and after single-tap animation (may double-fire if a debounced call is pending) |
| `onStaticPinPositionMove` | `(pos: Vec2D) => void` | - | Fires on every transform frame with pin's current content position. Shares the `_invokeOnTransform()` path with `onTransform`, so inherits the same three caveats: (1) **fires twice per pan/pinch frame** during active gestures (dual `panAnim`/`zoomAnim` listeners); (2) also fires from `componentDidUpdate` on layout measurement changes (first layout, rotation) and programmatic `staticPinPosition` prop changes — not only during gestures; (3) during `zoomTo(level, zoomCenter)` animation frames the callback fires twice per frame and the **first** fire delivers a geometrically wrong pin content position because `offsetX`/`offsetY` are stale (new `zoomLevel` applied before `panAnim` has been updated — see zoomTo() Listener Pattern). Only the second fire per zoomTo frame is correct. This stale-value problem is unique to the programmatic `zoomTo(level, zoomCenter)` path; gesture frames assign offsets manually before calling `setValue()` so both fires carry correct values. `onStaticPinPositionChange` (debounced) is unaffected because both fires happen in the same tick and the debounce queue overwrites the stale value before the 100ms timer fires |
| `onStaticPinPress` | `(evt) => void` | - | Tap on the pin (short press, under `longPressDuration`) |
| `onStaticPinLongPress` | `(evt) => void` | - | Long press on the pin |
| `pinProps` | `ViewProps` | `{}` | Extra props passed to pin wrapper. `style` is extracted and applied separately from other props |

### External Animated Values

| Prop | Type | Description |
|------|------|-------------|
| `zoomAnimatedValue` | `Animated.Value` | Use an external zoom animated value (component won't stop its animation on unmount) |
| `panAnimatedValueXY` | `Animated.ValueXY` | Use an external pan animated value (component won't stop its animation on unmount) |

### Callbacks

Most callbacks receive `(event, gestureState, zoomableViewEventObject)`. Exceptions noted per row:

| Callback | When | Signature exception |
|----------|------|---------------------|
| `onTransform` | Every pan/zoom frame. Also fires from `componentDidUpdate`: **twice on first layout** (init block + measurements-changed block both execute in the same call — the init block sets `onTransformInvocationInitialized=true`, which immediately satisfies the measurements-changed block's guard), **once on rotation** (only the measurements-changed block runs), and **once on programmatic `staticPinPosition` prop change**. Fires **twice per pan/pinch frame** during active gestures because `_setNewOffsetPosition` and `_handlePinching` both call `panAnim.setValue()` AND `zoomAnim.setValue()`, each of which independently triggers `_invokeOnTransform()` via its listener. Also fires **twice per call** from programmatic `moveTo()`/`moveBy()` (same dual-listener path via `_setNewOffsetPosition`) — **three times per call when the programmatic `moveTo()`/`moveBy()` cancels an in-flight `zoomTo(level, zoomCenter)` animation** (the `zoomToListenerId` listener on `zoomAnim` triggers a second `panAnim.setValue()` call before the `start()` end-callback removes the listener, producing an extra `panTransformListenerId` fire; see `moveTo()`/`moveBy()` Public Methods entries). Fires **once** from `moveStaticPinTo()` (per instant call, or per animation frame on the animated path — fires even though `moveStaticPinTo` bypasses `_setNewOffsetPosition`/`onShiftingBefore`/`After`). Additionally, `zoomTo(level, zoomCenter)` animation frames fire twice per frame with the first fire carrying stale `offsetX`/`offsetY` (see zoomTo() Listener Pattern). Consumers dispatching state updates should deduplicate | Receives only `ZoomableViewEvent` (no event/gestureState) |
| `onLayout` | Internal measurements change | Receives `{ nativeEvent: { layout } }` |
| `onSingleTap` | Single tap confirmed (after double-tap delay) | `(event, zoomableViewEventObject)` — no gestureState |
| `onDoubleTapBefore` | Before double-tap zoom executes | `(event, zoomableViewEventObject)` — no gestureState |
| `onDoubleTapAfter` | After double-tap zoom executes (fires synchronously before animation runs). `zoomLevel` in the event is overridden to the TARGET zoom level, not the current pre-animation level; `offsetX`/`offsetY` still reflect pre-animation state | `(event, zoomableViewEventObject)` — no gestureState |
| `onLongPress` | Long press detected | |
| `onShiftingBefore` | Before pan frame applies. Return `true` to block | `event` and `gestureState` are `null` — null-guard required |
| `onShiftingAfter` | After pan frame applies. **Return value is ignored** — unlike `onShiftingBefore` (where returning `true` blocks the frame), `onShiftingAfter`'s declared `boolean` return type is misleading; the call site does not capture it, so returning `true` has no effect | `event` and `gestureState` are `null` — null-guard required |
| `onShiftingEnd` | Pan gesture ends. **Fires based on `gestureType` classification, not on whether any pan frame was actually applied.** `gestureType` is set to `'shift'` as soon as a 1-finger move exceeds 2px on either axis — BEFORE any blocking check runs. Blocking checks (`panEnabled=false`, `disablePanOnInitialZoom` at `initialZoom`, or `onShiftingBefore` returning `true`) cause `_handleShifting` / `_setNewOffsetPosition` to return early without clearing `gestureType`. At gesture end `onShiftingEnd` still fires because `gestureType === 'shift'`. Consumers using these flags as a pan lock will receive `onShiftingEnd` after every >2px finger movement even though zero pan frames were applied. | |
| `onZoomBefore` | Fires on every pinch frame (real event/gestureState) AND at start of `zoomTo()` (null, null). Return `true` blocks pinch frames only — ignored during `zoomTo()`. **Blocked pinch frames do NOT update the gesture-tracking reference values** `lastGestureTouchDistance` or `lastGestureCenterPosition`: `_handlePinching` returns at line 617 before reaching `this.lastGestureTouchDistance = distance` (line 626) or the `_calcOffsetShiftSinceLastGestureState(gestureCenterPoint)` call at line 697 (which is where `lastGestureCenterPosition` is updated). If the consumer blocks several consecutive frames and then stops blocking (conditional mid-gesture gating), the next unblocked frame computes `distance / lastGestureTouchDistance` and `dx/dy` against stale references captured before the block, producing a sudden **zoom jump AND pan-center jump** equal to the accumulated blocked delta. Workaround: prefer coarse gating (use `zoomEnabled={false}` or a parent-level responder block) over mid-gesture `onZoomBefore` blocks, or accept that unblock transitions will produce a single-frame jump. | During `zoomTo()`: `event` and `gestureState` are `null` — null-guard required |
| `onZoomAfter` | After each pinch frame (real event/gestureState) AND synchronously at end of `zoomTo()` invocation before animation frames run (null, null) — `zoomLevel` in the event reflects the pre-animation value, not the target | During `zoomTo()`: `event` and `gestureState` are `null` — null-guard required |
| `onZoomEnd` | Pinch gesture ends | |
| `onPanResponderGrant` | Gesture responder acquired | |
| `onPanResponderEnd` | Gesture responder released — fires on normal release AND as the first step of termination (the terminate handler calls `_handlePanResponderEnd` before firing `onPanResponderTerminate`) | |
| `onPanResponderMove` | Every move frame. Return `true` to intercept (prevents default handling) | |
| `onPanResponderTerminate` | Responder taken by another component. **Not** mutually exclusive with `onPanResponderEnd`: on termination, `onPanResponderEnd` fires first, then (if `gestureType==='pinch'`) `onZoomEnd` or (if `gestureType==='shift'`) `onShiftingEnd`, then `onPanResponderTerminate`. Synchronous callback count per termination: **3 when gestureType is `'pinch'` or `'shift'`, 2 when gestureType is `null`** (no movement classified — no onZoomEnd/onShiftingEnd runs). When gestureType is `null`, `_handlePanResponderEnd` also invokes `_resolveAndHandleTap`, which may **asynchronously** fire `onSingleTap` (or `onDoubleTapBefore`/`onDoubleTapAfter`) after `doubleTapDelay` ms — an often-overlooked tap resolution on the termination path | |
| `onPanResponderTerminationRequest` | Another component wants responder. Return `true` to allow. **Default when not provided: deny (`false`)** — component never yields to another responder. To allow embedding in `ScrollView` or React Navigation, provide this callback returning `true` | |
| `onShouldBlockNativeResponder` | Block native responder. Default: `true` | |
| `onStartShouldSetPanResponder` | Before gesture responder is set | `(event, gestureState, zoomableViewEventObject, alwaysFalse)` — 4 args; **the 4th arg is hardcoded `false`** (not computed from any internal state or base-component result — misleadingly named historically) and the return value is ignored (component always claims responder) |
| `onStartShouldSetPanResponderCapture` | Capture phase for start | `(event, gestureState)` — no zoomableViewEventObject; returns boolean |
| `onMoveShouldSetPanResponderCapture` | Capture phase for move | `(event, gestureState)` — no zoomableViewEventObject; returns boolean |

### ZoomableViewEvent Shape

```ts
{
  zoomLevel: number;
  offsetX: number;
  offsetY: number;
  originalHeight: number;
  originalWidth: number;
  originalPageX: number;
  originalPageY: number;
}
```

---

## Public Methods

### `zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean`
Animate to a specific zoom level. `zoomCenter` specifies the point in top-left-relative viewport coordinates (`{x:0,y:0}` = top-left corner; `{x:w/2,y:h/2}` = center) that stays fixed on screen during the zoom. Returns `false` if zoom is disabled or level is out of bounds. **Animation duration is the React Native `Animated.timing` default of 500ms**, with `Easing.out(Easing.ease)` — `getZoomToAnimation` (`src/animations/index.ts`) passes no explicit `duration`, so any future RN default change would propagate silently.

### `zoomBy(zoomLevelChange: number): boolean`
Zoom by a delta from current level. Defaults to `zoomStep` if delta is `0`, `null`, or `undefined` (uses `||=`, so any falsy value triggers the default). If `zoomStep` is also falsy, the call is a no-op.

### `moveTo(newOffsetX: number, newOffsetY: number): void`
Move the viewport so a specific position in the zoom subject is centered. **Requires layout measurement to have completed** — the method reads `originalWidth`/`originalHeight` from state and silently no-ops (returns with no error) if either is `0` (i.e., before `onLayout` fires). Calls from `componentDidMount`, from `useEffect` with empty deps, or from refs before first layout will be silently dropped. Fires `onShiftingBefore`/`onShiftingAfter` via `_setNewOffsetPosition`, and fires `onTransform` **twice per call** normally, but **three times per call when cancelling an in-flight `zoomTo(level, zoomCenter)` animation** — the `zoomToListenerId` listener on `zoomAnim` triggers a second `panAnim.setValue()` call before the `start()` end-callback removes the listener, producing an extra `panTransformListenerId` fire. **Not gated by `panEnabled` or `disablePanOnInitialZoom`** — those only apply to gesture-driven panning; programmatic calls pan freely. **Cancels in-flight `zoomTo()` animations silently** — `_setNewOffsetPosition` calls `zoomAnim.setValue(this.zoomLevel)` unconditionally, and `Animated.Value.setValue()` implicitly `stopAnimation()`s any running animation on that value. The `zoomTo()` start callback fires with `finished=false`, and in the `zoomCenter` case the third `onTransform` fire is itself a consumer-visible signal of the cancellation.

### `moveBy(offsetChangeX: number, offsetChangeY: number): void`
Shift the viewport by a pixel offset. Unlike `moveTo()`, has no layout-measurement prerequisite — works immediately on mount because it operates on current offset values, not measured dimensions. Fires `onShiftingBefore`/`onShiftingAfter` via `_setNewOffsetPosition`, and fires `onTransform` **twice per call** normally, but **three times per call when cancelling an in-flight `zoomTo(level, zoomCenter)` animation** (same `zoomToListenerId` cascade as `moveTo()`). **Not gated by `panEnabled` or `disablePanOnInitialZoom`** — same caveat as `moveTo()`. **Cancels in-flight `zoomTo()` animations silently** — same `zoomAnim.setValue()` side effect as `moveTo()`.

### `moveStaticPinTo(position: Vec2D, duration?: number): void`
Pan the view so the static pin points at `position` in content coordinates. Requires `staticPinPosition`, `contentWidth`, and `contentHeight` to be set. If `duration` is truthy, animates the pan via `Animated.timing`; **any falsy `duration` (`0`, `undefined`, `null`) takes the instant `panAnim.setValue()` path** — the code uses a plain `if (duration)` guard, so `duration=0` does NOT produce a 0ms animated path, it takes the synchronous path. Same falsy-guard trap pattern as `doubleTapDelay=0` and `movementSensibility=0`. **Does not fire `onShiftingBefore`/`onShiftingAfter`** — sets offsets directly without routing through `_setNewOffsetPosition`, bypassing the onShifting gate entirely. Unlike `moveTo()`/`moveBy()`, consumers' `onShiftingBefore` gate cannot block this method. **Still fires `onTransform` once per instant call, or once per animation frame for the animated path** (via the direct `panAnim.setValue()` call). **Not gated by `panEnabled` or `disablePanOnInitialZoom`** — bypasses both flags via direct `panAnim` manipulation without routing through `_handleShifting`. **Does NOT cancel in-flight `zoomTo(level, zoomCenter)` animations** — unlike `moveTo()`/`moveBy()`, this method only touches `panAnim` and never calls `zoomAnim.setValue()`, so any running `zoomToListenerId` stays registered. On the next `zoomAnim` animation frame, the zoomTo listener re-reads `this.offsetX`/`this.offsetY` (now set by `moveStaticPinTo`) and calls `panAnim.setValue()` with a zoom-centered position, overwriting the pin alignment after ~16ms. To reliably reposition during a zoom animation, call `moveTo()`/`moveBy()` first (which cancels the zoomTo) or wait for `zoomTo()` to complete before calling `moveStaticPinTo()`.

### `gestureStarted: boolean` (read-only)
Whether a gesture is currently in progress. Useful for consumers to suppress their own updates during active interaction. **Caveat:** `gestureStarted` is reset to `false` as the **last** operation of `_handlePanResponderEnd` — it remains `true` throughout the entire end-callback sequence. For a **double-tap release** the sequence is (in order) `onDoubleTapBefore`, `onZoomBefore`, `onZoomAfter`, `onDoubleTapAfter`, `onPanResponderEnd`, then the immediate `onStaticPinPositionChange` fired from `_updateStaticPin` — all fire before `gestureStarted` is reset, because `_resolveAndHandleTap` runs synchronously inside `_handlePanResponderEnd` (before the reset). `onZoomEnd`/`onShiftingEnd` do **not** fire on the double-tap path because both are gated on `gestureType === 'pinch'` / `'shift'`, but double-tap runs only when `gestureType === null`. For **pinch or pan gesture releases** the sequence is `onPanResponderEnd`, then `onZoomEnd` (if `gestureType==='pinch'`) or `onShiftingEnd` (if `gestureType==='shift'`), then the immediate `onStaticPinPositionChange` — the pre-resolve double-tap callbacks do not fire. Consumers cannot read `gestureStarted` inside any of these callbacks to distinguish "gesture ending" from "mid-gesture."

---

## Gesture System

Uses `PanResponder` with `onStartShouldSetPanResponder: true` (always claims the gesture). Gesture classification happens during movement:

### Classification Rules
- **1 finger, moved >2px**: `gestureType = 'shift'` (pan)
- **2 fingers**: `gestureType = 'pinch'` (zoom)
- **3+ fingers**: Gesture ends (via `_handlePanResponderEnd`), only 1-2 touch supported. **`_handlePanResponderEnd` is invoked twice** for any 3+-finger interaction: once synchronously from the 3+-finger branch in `_handlePanResponderMove` (line 537), and a second time from the natural `onPanResponderRelease`/`onPanResponderTerminate` when the user lifts fingers. The first call resets `gestureType` to `null` (line 501), so the second call satisfies `if (!this.gestureType)` at line 464 and unconditionally invokes `_resolveAndHandleTap`. Two concrete consumer-visible consequences follow: (A) placing 3+ fingers simultaneously with no prior movement triggers spurious tap resolution — `onSingleTap` (after `doubleTapDelay`) or, if this follows a recent first tap, `onDoubleTapBefore` + full zoom animation + `onDoubleTapAfter`; (B) the end-callback sequence (`onPanResponderEnd`, `onZoomEnd`/`onShiftingEnd` based on the pre-reset `gestureType`, `_updateStaticPin`) fires twice per 3+-finger release. Consumers relying on end-callback counts for telemetry should deduplicate.
- **No movement**: `gestureType` stays `null` → treated as tap on release

### Gesture Lifecycle
1. `onPanResponderGrant` → Start long-press timer (only if `onLongPress` prop is provided), fire consumer `onPanResponderGrant` callback (`gestureStarted` is still `false` at this point), then stop in-flight animations (capturing final values via `stopAnimation` callback) and set `gestureStarted = true`. **This step can also be triggered mid-drag from two additional sources**, both producing non-zero `gestureState.dx`/`dy` at callback time: (a) the StaticPin drag-to-parent handoff (see Static Pin § Drag-to-parent handoff), and (b) a transition from 3+ fingers down to 1-2 fingers during an active gesture (the 3+-finger branch in `_handlePanResponderMove` calls `_handlePanResponderEnd`, resetting `gestureStarted=false`; the next move event with ≤2 fingers then re-invokes `_handlePanResponderGrant` with accumulated displacement). Long-press timer behavior after mid-drag re-grant: **StaticPin handoff is safe** — the handoff only fires when `Math.abs(dx) > 5 || Math.abs(dy) > 5`, which is exactly the same condition the 1-finger branch uses to clear the newly-set timer. **3+-to-2-finger transition is safe** — the 2-finger branch clears `longPressTimeout` unconditionally with no displacement check. **3+-to-1-finger transition is NOT safe when cumulative displacement is ≤5px on both axes**: the 1-finger branch's guard fails, the re-grant's long-press timer survives, and `onLongPress` may fire `longPressDuration` ms later during an active gesture. Consumers wiring `onLongPress` should guard against firing during active gesture state when `gestureStarted=true`.
2. `onPanResponderMove` → Classify gesture, dispatch to `_handlePinching` or `_handleShifting`
3. `onPanResponderEnd` → If no gesture type, resolve as tap. Fire end callbacks (including `onZoomEnd`/`onShiftingEnd` based on gestureType). Update static pin position. Reset state. On termination the same handler runs first, then `onPanResponderTerminate` fires additionally (both callbacks fire on termination — they are not alternatives).

### Gesture-to-Shift Transition
When switching from pinch to shift (or vice versa), `lastGestureCenterPosition` is recalculated at the transition boundary to prevent a jump. The center point resets so the delta calculation starts fresh.

---

## Zoom Behavior

### Pinch Zoom
- Zoom center = midpoint of two touches (or `staticPinPosition` if pin is active — keeps pin stable during zoom)
- Sensitivity formula: `deltaGrowth * (1 - sensitivity * 9 / 100)` where `sensitivity` is 0-10
- Offset recalculated each frame to keep the zoom center visually stable
- Min/max zoom enforced per frame
- **When `zoomEnabled` is `false`:** `_handlePinching` returns immediately before any callback fires — **no** `onZoomBefore`, `onZoomAfter`, or other zoom callback runs for pinch gestures. `onZoomBefore`/`onZoomAfter` ALSO do not fire for double-tap attempts when `zoomEnabled=false`, because `zoomTo()` returns early at its first guard (line 1042, `if (!this.props.zoomEnabled) return false`) BEFORE reaching `onZoomBefore` at line 1046. However, `_handleDoubleTap` is asymmetric with pinch in a different dimension: the double-tap-specific callbacks `onDoubleTapBefore` and `onDoubleTapAfter` still fire (with a synthetic payload) despite `zoomTo()` bailing out — see Double-Tap Zoom § zoomEnabled=false. Net result: a consumer using `onZoomBefore` for analytics during a locked period sees no events at all (both pinch and double-tap paths bypass it); a consumer using the `onDoubleTapBefore`/`onDoubleTapAfter` pair sees spurious matched pairs even though the view did not change.

### Double-Tap Zoom
- Advances zoom level as `currentLevel × (1 + zoomStep)` (multiplicative — e.g., `zoomStep=0.5` zooms 50% above current level), with three possible return paths in `_getNextZoomStep()`:
  1. If the computed next step **overshoots `maxZoom`**, it is **clamped to `maxZoom`** (intermediate step, not `initialZoom`)
  2. When already at `maxZoom` (detected via `zoomLevel.toFixed(2) === maxZoom.toFixed(2)` — 2-decimal precision, ~0.005 tolerance), returns `initialZoom`
  3. Otherwise returns the computed step
- Example cycle for `initialZoom=1, maxZoom=2, zoomStep=0.5`: `1 → 1.5 → 2 (clamped, not 2.25) → 1 → ...` — three distinct cycle states, not two
- **When `maxZoom` is `null`:** double-tap zoom is disabled entirely. `onDoubleTapBefore` fires but no zoom occurs and `onDoubleTapAfter` is never called (the `maxZoom == null` guard at the top of `_getNextZoomStep()` returns `undefined` unconditionally, for every call at any zoom level). Pinch zoom is unaffected.
- **When `zoomStep` is `null`:** double-tap zoom is disabled **only when not at `maxZoom`** — the guard ordering matters. `_getNextZoomStep()` checks `zoomLevel == maxZoom` BEFORE `zoomStep == null`, so at `maxZoom` the reset to `initialZoom` still executes: both `onDoubleTapBefore` and `onDoubleTapAfter` fire, `zoomTo(initialZoom)` runs with a real animation. At non-maxZoom levels, `zoomStep=null` returns `undefined` (only `onDoubleTapBefore` fires). This is NOT identical to `maxZoom=null`, which disables ALL double-taps unconditionally.
- **When `zoomEnabled` is `false`:** BOTH `onDoubleTapBefore` AND `onDoubleTapAfter` fire despite no zoom animation running. `_getNextZoomStep()` does not check `zoomEnabled`, so it returns a valid next step; `zoomTo()` is then called, bails out early (`!this.props.zoomEnabled` returns `false`), but `_handleDoubleTap` does not check the return value and fires `onDoubleTapAfter` unconditionally with a synthetic `zoomLevel` override equal to the would-be target. Consumers relying on the Before/After pair as a state-change signal will see a matched pair indistinguishable from a successful zoom even though the view did not change.
- Zoom center = tap position. When `doubleTapZoomToCenter` is set, the intended behavior is to anchor zoom at the view center, but due to a pre-existing bug the code passes `{x:0, y:0}` — which in the top-left-relative viewport coordinate system anchors to the top-left corner, not the center (see Props API row and Coordinate System § Known Issue)
- Uses `zoomTo()` internally

### zoomTo() Listener Pattern
When `zoomTo` is called with a `zoomCenter`, a listener on `zoomAnim` dynamically adjusts `panAnim` on each animation frame to keep the center point stable. The listener is cleaned up on animation completion. Rapid successive `zoomTo()` calls (e.g., fast double-taps) remove the previous listener before adding a new one to prevent permanent leaks.

**Animation-frame `onTransform` double-fire with stale pan values:** During a `zoomTo(level, zoomCenter)` animation, each zoom frame triggers listeners on `zoomAnim` in registration order: (1) `zoomListenerId` updates `this.zoomLevel`, (2) `zoomTransformListenerId` calls `_invokeOnTransform()` — **this fire carries the new `zoomLevel` but stale `offsetX`/`offsetY`** because `panAnim` has not yet been updated, (3) the `zoomTo` listener calls `panAnim.setValue(new_pan)`, (4) `panListenerId` updates `this.offsetX`/`this.offsetY`, (5) `panTransformListenerId` calls `_invokeOnTransform()` again with all values correct. Net result: `onTransform` fires twice per animation frame, the first with a chimera state. `zoomTo(level)` without a `zoomCenter` fires only once per frame (no panAnim adjustment). State machines reading `zoomLevel + offsetX` from the first fire will see an invalid combination that never existed as a stable component state.

---

## Pan / Shift Behavior

- Gesture panning is disabled when `panEnabled = false` or when `disablePanOnInitialZoom = true` and zoom is at `initialZoom`. **These flags only gate gesture-driven panning via `_handleShifting`** — all three programmatic pan methods (`moveTo`, `moveBy`, `moveStaticPinTo`) bypass both flags entirely (`moveTo`/`moveBy` route through `_setNewOffsetPosition` which has no `panEnabled`/`disablePanOnInitialZoom` check, gated only by `onShiftingBefore`; `moveStaticPinTo` manipulates `panAnim` directly and has no gates at all)
- Movement is scaled by `1 / zoomLevel / movementSensibility` — at higher zoom, the same finger movement produces less content shift
- No momentum/decay — pan stops immediately when finger lifts
- No boundary clamping — content can be panned freely without bounds

### onShiftingBefore Gate
If the consumer's `onShiftingBefore` callback returns `true`, the pan frame is silently dropped. This allows consumers to conditionally block panning.

---

## Static Pin

The static pin is a draggable overlay positioned at `staticPinPosition` in **component/viewport coordinates** (component-relative pixels, same space as CSS `left`/`top` — see Props API row and Coordinate System § Viewport Coordinates). It renders as an `Animated.View` positioned absolutely within the zoom container.

### Pin Positioning
- CSS position: `left: staticPinPosition.x`, `top: staticPinPosition.y`
- Transform: `translateY: -pinSize.height` (anchors bottom of pin to position), `translateX: -pinSize.width / 2` (centers horizontally)
- Pin is invisible (`opacity: 0`) until its layout is measured

### Pin Gesture Handling (StaticPin.tsx)

StaticPin has its own `PanResponder` that intercepts touches on the pin before the parent:

**Touch classification:**
- `onStartShouldSetPanResponder` → always `true` (pin claims all touches)
- Resets `hasDragged` and `parentNotified` refs on each new touch

**Drag threshold:** 5px in either axis (`Math.abs(dx) > 5 || Math.abs(dy) > 5`, using OR not AND; absolute displacement so leftward/upward drags trigger symmetrically with rightward/downward)

**Drag-to-parent handoff:**
1. Once threshold crossed, `hasDragged = true`, calls `onParentMove` (parent's `_handlePanResponderMove`)
2. If parent returns `undefined` (normal 1-2 finger handling), sets `parentNotified = true`
3. If parent returns `true` (3+ finger branch that internally called `_handlePanResponderEnd`), `parentNotified = false` — prevents spurious `onParentRelease` on finger lift
4. If parent returns `false` (consumer's `onPanResponderMove` prop intercepted the call and returned truthy, causing `_handlePanResponderMove` to early-return `false` at line 525 before the grant/classification logic), **neither `=== undefined` nor `else if (accepted)` branch fires**, so `parentNotified` stays `false`. Additionally, because the early return occurs before the `!this.gestureStarted → _handlePanResponderGrant` call, `gestureStarted` also stays `false`. On release, the handler checks `parentNotified` (false → skips `onParentRelease`), then `hasDragged` (true → silent drop, no tap/long-press evaluation). Outcome identical to the 3+-finger path (silent drop with `hasDragged=true`, `parentNotified=false`), but the internal state differs (`gestureStarted=false` in this path vs whatever the 3+-finger path left it in).

**Mid-drag re-grant caveat:** When the parent's `_handlePanResponderMove` runs via this handoff path, it checks `!this.gestureStarted` and calls `_handlePanResponderGrant` mid-drag (the original PanResponder grant never fired because StaticPin consumed the initial touch). The consumer-visible consequence is that the consumer's `onPanResponderGrant` callback fires with **non-zero `gestureState.dx`/`dy`** (the 5px threshold guarantees at least one axis has moved) — not the `dx=0`/`dy=0` typical at a fresh gesture start. The `longPressTimeout` is set by `_handlePanResponderGrant` but immediately cleared in the same synchronous `_handlePanResponderMove` call (the 1-finger branch's `Math.abs(dx) > 5 || Math.abs(dy) > 5` guard fires on the same gestureState that triggered the handoff), so `onLongPress` does NOT fire during active pin dragging.

**Release behavior:**
- If `parentNotified`: calls `onParentRelease` (parent's `_handlePanResponderEnd`) — completes the pan gesture properly
- If `hasDragged` but NOT `parentNotified`: silently drops (drag was handled by 3+ finger path OR consumer's `onPanResponderMove` prop intercepted the handoff call — see Drag-to-parent handoff case 4)
- If no drag: evaluates as tap or long press based on `Date.now() - tapTime` vs `longPressDuration`

**Terminate behavior:** three cases based on drag state:
- If `parentNotified === true`: calls `onParentTerminate` (parent's `_handlePanResponderEnd` + `onPanResponderTerminate` callback)
- If `hasDragged === true` but `parentNotified === false` (3+-finger path consumed the drag OR consumer's `onPanResponderMove` prop intercepted the handoff call — see Drag-to-parent handoff case 4, same silent-drop attribution as the Release behavior above): silent drop — no callback fires
- If `hasDragged === false` (brief touch, no movement): **nothing fires** — asymmetric with release behavior, which would have evaluated the same brief touch as tap/long-press and fired `onStaticPinPress`/`onStaticPinLongPress`. Consumers relying on `onStaticPinPress` to observe every brief touch will silently miss termination-path taps

### Pin Position Updates
- `onStaticPinPositionMove`: fires on every `onTransform` frame with the pin's content-space position (via `viewportPositionToImagePosition`). **Inherits `onTransform`'s trigger caveats:** fires twice per pan/pinch frame during active gestures (dual `panAnim`/`zoomAnim` listeners), also fires from `componentDidUpdate` on layout measurement changes (first layout, rotation) and programmatic `staticPinPosition` prop changes, and fires from programmatic `moveTo()`/`moveBy()` (twice per call normally, **three times per call when cancelling an in-flight `zoomTo(level, zoomCenter)` animation** — same `zoomToListenerId` cascade documented on the `moveTo()`/`moveBy()` Public Methods entries) and `moveStaticPinTo()` (once per instant call, or per animation frame)
- `onStaticPinPositionChange`: has two call paths:
  - **Debounced (100ms):** Fired via `_invokeOnTransform` from every site that calls it — active gesture frames, `componentDidUpdate` on layout measurement changes (first layout, rotation) and programmatic `staticPinPosition` prop changes, and programmatic `moveTo()`/`moveBy()`/`moveStaticPinTo()` calls (same trigger surface as `onStaticPinPositionMove`). Uses lodash `debounce`, cancelled on unmount
  - **Immediate:** Fired directly via `_updateStaticPin` at gesture end and after single-tap animation completion — no rate limiting. **`gestureStarted` is NOT yet reset to `false` when this fires at gesture end** — `_handlePanResponderEnd` calls `_updateStaticPin()` at line 498 and only sets `this.gestureStarted = false` at line 502 (the very last operation). Consumers cannot use `ref.current.gestureStarted` inside `onStaticPinPositionChange` to discriminate the immediate gesture-end call from mid-gesture debounced calls — the flag is `true` for both. This same ordering affects `onPanResponderEnd`, `onZoomEnd`, and `onShiftingEnd`: all of them fire while `gestureStarted` is still `true`.
  - **Double-fire risk:** At gesture end, if a debounced call is pending from the last transform frame, the consumer receives one immediate call followed by a second debounced call ~100ms later
- Both callbacks require `contentWidth` and `contentHeight` to be set

### Single-Tap Pan-to-Pin
When `staticPinPosition` is set and user single-taps the content (not the pin), the view animates (200ms) to center on the tap position relative to the pin. The `_updateStaticPin` callback only fires if the animation completes (`finished === true`) and the component is still mounted.

---

## Tap Handling

Tap resolution runs when no gesture type was classified (no movement detected). **Ordering:** `_resolveAndHandleTap` is called synchronously inside `_handlePanResponderEnd` *before* the `onPanResponderEnd` consumer callback fires. For a double-tap, all tap callbacks (`onDoubleTapBefore`, `onZoomBefore`, `onZoomAfter`, `onDoubleTapAfter`) complete synchronously before `onPanResponderEnd` — consistent with the `gestureStarted` section above. For a single-tap, the `singleTapTimeoutId` is *scheduled* before `onPanResponderEnd` fires, but the actual `onSingleTap` callback arrives asynchronously after `doubleTapDelay` ms. Consumers cannot use `onPanResponderEnd` as a pre-tap hook.

### Single vs Double-Tap Disambiguation
`_resolveAndHandleTap` uses a delayed-resolution pattern:

1. **First tap:** Records timestamp (`doubleTapFirstTapReleaseTimestamp`) and tap position (`doubleTapFirstTap`). Starts a `setTimeout` of `doubleTapDelay` ms.
2. **Second tap within `doubleTapDelay`:** Cancels the pending timeout (`singleTapTimeoutId`), clears saved state, calls `_handleDoubleTap`.
3. **No second tap (timeout fires):** Clears saved state. If `staticPinPosition` is set, starts a 200ms pan animation toward the tap position relative to the pin. Then fires `onSingleTap` callback (animation is already in progress when callback runs).

### Timeout Cleanup
- `singleTapTimeoutId` is cleared on: double-tap detection and `componentWillUnmount` (not cleared on new gesture start — a tap followed by immediate pan within `doubleTapDelay` will fire `onSingleTap` mid-gesture)
- `doubleTapFirstTapReleaseTimestamp` is cleared on: double-tap detection and single-tap timeout fire

### Long-press-then-release fires `onSingleTap` too
A long-press-then-release with no movement satisfies the same `gestureType === null` condition as a tap, so it enters the tap-resolution path on release. The sequence: (1) `_handlePanResponderGrant` starts `longPressTimeout`; (2) after `longPressDuration` ms the timer fires `onLongPress` and sets `longPressTimeout = null`; (3) on release, `gestureType` is still `null` so `_handlePanResponderEnd` calls `_resolveAndHandleTap`; (4) the `if (this.longPressTimeout)` guard at the start of `_handlePanResponderEnd` is false because the timer already fired and nulled itself — there is no `longPressOccurred` sentinel to suppress tap resolution; (5) `_resolveAndHandleTap` schedules `singleTapTimeoutId` which fires `onSingleTap` `doubleTapDelay` ms later. **Consequence:** any long-press-then-release fires BOTH `onLongPress` (at `longPressDuration` ms) AND `onSingleTap` (at `longPressDuration + doubleTapDelay` ms, default ~1000 ms). `visualTouchFeedbackEnabled` also renders the post-long-press touch circle via `_addTouch`. `gestureStarted` cannot be used to filter this — it is `false` by the time the async `onSingleTap` callback fires. Consumers combining `onLongPress` with `onSingleTap` must de-duplicate in their own code.

---

## Animation Listeners & Lifecycle

### Listener Tracking
All `Animated.addListener` calls store their listener IDs for cleanup:
- `panListenerId` — offset tracking listener on `panAnim`
- `zoomListenerId` — zoom level tracking listener on `zoomAnim`
- `panTransformListenerId` — onTransform listener on `panAnim` (added lazily in `componentDidUpdate`)
- `zoomTransformListenerId` — onTransform listener on `zoomAnim` (added lazily)
- `zoomToListenerId` — temporary listener during `zoomTo()` animation

### componentDidMount
- Sets `mounted = true`
- Runs initial `measureZoomSubject`
- Starts 1-second measurement interval

### componentWillUnmount
Sets `mounted = false`, then tears down in order:
1. Clear measurement interval
2. Stop in-flight animations on `panAnim` and `zoomAnim` (skipped if external values provided)
3. Remove all 5 animation listeners
4. Clear pending timeouts (`singleTapTimeoutId`, `longPressTimeout`)
5. Cancel debounced `onStaticPinPositionChange`

### Mounted Guards
`if (!this.mounted) return` is checked in:
- `measureZoomSubject` (outer and inner timeout)
- `_updateStaticPin` animation completion callback
- `_removeTouch`

### stopAnimation with Callback
On gesture start (`_handlePanResponderGrant`), animations are stopped individually:
```ts
this.panAnim.x.stopAnimation((x) => { this.offsetX = x; });
this.panAnim.y.stopAnimation((y) => { this.offsetY = y; });
this.zoomAnim.stopAnimation((zoom) => { this.zoomLevel = zoom; });
```
This captures the final animated value into the JS-side mirrors, preventing drift between `Animated` values and JS state.

---

## Coordinate System

### Content Coordinates
`contentWidth`, `contentHeight`, and `moveStaticPinTo`'s `position` argument operate in "content coordinates" — the logical pixel space of the content being zoomed. Origin is top-left of the content. `onStaticPinPositionChange`/`onStaticPinPositionMove` callback payloads are also in content space (they are the output of `viewportPositionToImagePosition`).

### Viewport Coordinates
`staticPinPosition` operates in viewport/component coordinates — component-relative pixels, the same space as CSS `left`/`top` on the pin View. It is used directly as the pinch zoom center and passed as the `viewportPosition` input to `viewportPositionToImagePosition`. The viewport space and content space are only the same when the content is rendered unscaled and un-offset at the component's top-left.

### Viewport-to-Image Conversion
`viewportPositionToImagePosition` converts a viewport pixel position to content coordinates, accounting for current zoom, offset, and measured dimensions. Used to compute the pin's logical position after every transform. **Assumes the content is rendered with `contain` resize-mode semantics** (aspect-ratio-preserving, letterboxed): internally calls `applyContainResizeMode(imageSize, viewportSize)` which computes the content's on-container origin assuming it was scaled to fit entirely within the viewport while preserving aspect ratio. Consumers whose content uses `cover`, `fill`, `stretch`, or absolute positioning will receive systematically wrong values from `onStaticPinPositionChange`/`onStaticPinPositionMove` with no error or warning.

### Zoom Center Coordinates
In `zoomTo()` and double-tap, zoom center is in component viewport space with top-left origin: `{ x: 0, y: 0 }` = top-left corner of the zoom subject; `{ x: originalWidth/2, y: originalHeight/2 }` = true center. Computed as `pageX - originalPageX` / `pageY - originalPageY`.

**Known issue:** `doubleTapZoomToCenter` passes `{ x: 0, y: 0 }` intending to mean "center", but this actually anchors the zoom to the top-left corner. This is a pre-existing code bug.

### moveStaticPinTo Math
```
offsetX = contentWidth/2 - position.x + (staticPinPosition.x - originalWidth/2) / zoomLevel
offsetY = contentHeight/2 - position.y + (staticPinPosition.y - originalHeight/2) / zoomLevel
```
This pans the view so the static pin aligns with the target position in content space.

---

## Removed Features

These features were stripped in this PR to simplify the upcoming Reanimated migration:

### Pan Boundaries (`bindToBorders`, `panBoundaryPadding`)
Previously clamped pan offsets to keep content within view borders. Removed `applyPanBoundariesToOffset.ts` helper, `getBoundaryCrossedAnim` spring animation, and all boundary-related offset calculations. Content now pans freely without limits.

### Pan Momentum (`disableMomentum`)
Previously applied a decay animation on pan release (`getPanMomentumDecayAnim` using velocity from `gestureState.vx/vy`). Removed — pan now stops immediately when finger lifts.

### Pin Animation (`animatePin`, `pinAnim`)
Previously raised the pin by 10px (`translateY: -10`) on gesture start and dropped it back on release using `Animated.timing`. Removed — pin stays at its static position during all gestures. The `pinAnim` Animated.ValueXY is no longer passed to `StaticPin`.

### Boundary-Aware Offsets
Previously `offsetX`/`offsetY` were stored in a `__offsets` object with `boundaryCrossedAnimInEffect` flags that gated when boundary spring animations were active. Simplified to plain number fields on the class.

---

## Breaking Changes

### Removed Props
| Prop | Previous Default | Migration |
|------|-----------------|-----------|
| `bindToBorders` | `true` | Remove from JSX. If you need boundary clamping, implement in `onShiftingBefore`/`onShiftingAfter` |
| `panBoundaryPadding` | `0` | Remove from JSX |
| `disableMomentum` | `false` | Remove from JSX. Momentum is always off now |
| `animatePin` | `true` | Remove from JSX. Implement pin raise/drop animation in your custom `staticPinIcon` if needed |

### Removed Exports
- `getBoundaryCrossedAnim` from `./animations`
- `getPanMomentumDecayAnim` from `./animations`
- `applyPanBoundariesToOffset` from `./helper/applyPanBoundariesToOffset`

### Internal Changes (No Public API Impact)
- `Vec2D` type is no longer used in internal gesture/pan math, but remains publicly exported from `src/typings` — consumers importing `Vec2D` are unaffected

### StaticPin API Changes
- `pinAnim` prop removed — no longer needed
- `onParentRelease` prop added — StaticPin now properly completes the parent gesture on release
- `onParentTerminate` prop added — StaticPin handles responder termination correctly
- `longPressDuration` prop added — uses parent's duration instead of hardcoded 500ms
- `pinProps.style` is now extracted and applied as a separate style layer (previously spread as-is)
- Drag threshold changed from `Math.abs(dx) > 5 AND Math.abs(dy) > 5` to `Math.abs(dx) > 5 OR Math.abs(dy) > 5` — drags are detected earlier (on any single axis exceeding 5px absolute, not both)

### Behavior Changes
- `stopAnimation` on gesture start now uses callbacks to capture final values — prevents offset drift that could occur when animations were stopped without reading their final state
- `onStaticPinPositionChange` after single-tap pan only fires when animation finishes AND component is mounted — previously could fire post-unmount

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
| `zoomEnabled` | `boolean` | `true` | Enable/disable zooming dynamically. **Transitioning from `true` to `false` immediately snaps zoom to `initialZoom`** via a non-animated `zoomAnim.setValue()` in `componentDidUpdate` — bypasses `onZoomBefore`/`onZoomAfter` entirely (but `onTransform` does fire via `zoomTransformListenerId`; see the `onTransform` row for the cross-reference, and see the `zoomTo(level, zoomCenter)` Listener Pattern for the chimera-state caveat if this transition happens while a `zoomTo(level, zoomCenter)` animation is in-flight — the still-registered `zoomToListenerId` may run against the snap and produce an intermediate fire with new `zoomLevel` but stale `offsetX`/`offsetY`). Re-enabling does not restore the previous zoom level. If `initialZoom=0`, the reset is skipped (falsy guard). Asymmetric with `panEnabled`, which has no equivalent reset |
| `panEnabled` | `boolean` | `true` | Enable/disable panning dynamically. **Mid-gesture `false→true` toggle causes a pan jump** — `_handleShifting` returns early (line 786-792) **before** `_calcOffsetShiftSinceLastGestureState` updates `lastGestureCenterPosition`, so blocked frames leave the reference stale. On the first unblocked frame, the accumulated finger-displacement-during-blocked-period collapses into a single-frame pan jump (analogous to the `onZoomBefore`-blocking hazard at line 107). Same jump occurs when `disablePanOnInitialZoom` auto-unblocks as zoom crosses above `initialZoom`. Consumers needing frame-level pan gating without this hazard should use `onShiftingBefore` returning `true`, which is safe because `_calcOffsetShiftSinceLastGestureState` runs BEFORE the `onShiftingBefore` check in `_setNewOffsetPosition` — references stay current on blocked frames |
| `initialZoom` | `number` | `1` | Zoom level on startup. **`0` is silently ignored** at startup — the constructor uses a plain truthy guard (`if (this.props.initialZoom)`), so `0` is falsy and `zoomLevel` stays at the internal default of `1`. Asymmetric with `initialOffsetX`/`initialOffsetY` which correctly use `!= null` guards and accept `0` |
| `maxZoom` | `number` | `1.5` | Maximum zoom level. `null` = unlimited pinch zoom; double-tap still cycles back using a derived three-step ceiling when `zoomStep` is set (see Double-Tap Zoom section) |
| `minZoom` | `number` | `0.5` | Minimum zoom level |
| `initialOffsetX` | `number` | `0` | Starting horizontal offset |
| `initialOffsetY` | `number` | `0` | Starting vertical offset |
| `zoomStep` | `number` | `0.5` | Zoom increment on double tap |
| `pinchToZoomInSensitivity` | `number` | `1` | Resistance to zoom in (0-10, higher = less sensitive). **`null` silently disables pinch zoom-in** — the `== null` guard in `_handlePinching` returns early AFTER `onZoomBefore` has already fired, so every zoom-in pinch frame fires `onZoomBefore` without a matching `onZoomAfter`, breaking matched-pair state machines. The null-sensitivity early return sits AFTER `lastGestureTouchDistance` is updated but BEFORE `_calcOffsetShiftSinceLastGestureState` runs, so blocked frames leave **only `lastGestureCenterPosition` stale** (not `lastGestureTouchDistance`). A mid-gesture transition from `null` to a numeric value produces a single-frame **pan-center jump** (no zoom jump) on the first unblocked frame — asymmetric with the `onZoomBefore`-blocking path in the callbacks table (line 107), which leaves both references stale and produces zoom jump + pan-center jump |
| `pinchToZoomOutSensitivity` | `number` | `1` | Resistance to zoom out (0-10, higher = less sensitive). **`null` silently disables pinch zoom-out** — same early-return pattern as `pinchToZoomInSensitivity=null`: `onZoomBefore` fires, then sensitivity null-guard returns, `onZoomAfter` never fires for affected frames. Same partial-stale-reference side effect as `pinchToZoomInSensitivity=null`: blocked frames leave only `lastGestureCenterPosition` stale, so a mid-gesture transition from `null` to a numeric value produces a single-frame **pan-center jump** (no zoom jump) |
| `movementSensibility` | `number` | `1` | Pan movement resistance (0.5-5, higher = less sensitive). **`0` or any falsy value silently disables panning entirely** — a truthy guard in `_calcOffsetShiftSinceLastGestureState` short-circuits (also prevents division-by-zero). Same falsy-guard trap pattern as `doubleTapDelay=0` and `zoomBy(0)` |
| `disablePanOnInitialZoom` | `boolean` | `false` | Block panning when at initial zoom level. **Uses strict `===` equality** (`this.zoomLevel === this.props.initialZoom` in `_handleShifting`) — any floating-point drift from pinch-in-then-pinch-out cycles leaves `zoomLevel` at values like `0.9999997` or `1.0000003` rather than exactly `initialZoom`, and the block silently disengages even though the view is visually at `initialZoom`. Asymmetric with `_getNextZoomStep`, which uses `.toFixed(2)` tolerance for an analogous comparison against `maxZoom`. Consumers needing a reliable lock should re-check via `onShiftingBefore` using a tolerance comparison (e.g. `parseFloat(zoomLevel.toFixed(2)) === parseFloat(initialZoom.toFixed(2))`) |
| `doubleTapDelay` | `number` | `300` | Max ms between taps for double-tap detection. **`0` silently disables double-tap detection** — the truthy guard in `_resolveAndHandleTap` short-circuits, so every tap is treated as a single tap. **`0` combined with `visualTouchFeedbackEnabled={true}` (the default) causes a fatal crash** ("Text strings must be rendered within a `<Text>` component") because the render path `doubleTapDelay && <AnimatedTouchFeedback/>` short-circuits to the numeric `0` (not `false`/`null`) and React Native cannot render `0` as a child of a non-Text `View`. Additionally `_addTouch` still runs unconditionally on every tap so the `touches` state array grows unbounded. **To safely set `doubleTapDelay={0}`, consumers MUST also set `visualTouchFeedbackEnabled={false}`.** (Pre-existing behavior, not introduced by this PR.) |
| `doubleTapZoomToCenter` | `boolean` | - | Double tap always zooms to the viewport center (`{x: originalWidth/2, y: originalHeight/2}`) instead of the tap point |

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
| `onStaticPinPositionChange` | `(pos: Vec2D) => void` | - | Fires when pin's content position changes. Debounced (100ms) during active transforms; any pending delivery is synchronously flushed at gesture end, after single-tap pan animation completion, and after natural `zoomTo()` completion when `staticPinPosition` is set |
| `onStaticPinPositionMove` | `(pos: Vec2D) => void` | - | Fires on every transform frame with pin's current content position. Shares the `_invokeOnTransform()` path with `onTransform`, so inherits the same three caveats: (1) **fires once per pan frame, but twice per pinch frame** during active gestures — `_setNewOffsetPosition()` now updates only `panAnim`, while `_handlePinching()` still updates both `panAnim` and `zoomAnim`; (2) also fires from `componentDidUpdate` on layout measurement changes (first layout, rotation) and programmatic `staticPinPosition` prop changes — not only during gestures; (3) during `zoomTo(level, zoomCenter)` animation frames the callback fires twice per frame and the **first** fire delivers a geometrically wrong pin content position because `offsetX`/`offsetY` are stale (new `zoomLevel` applied before `panAnim` has been updated — see zoomTo() Listener Pattern). Only the second fire per zoomTo frame is correct. This stale-value problem is unique to the programmatic `zoomTo(level, zoomCenter)` path; gesture frames assign offsets manually before calling `setValue()` so both fires carry correct values. `onStaticPinPositionChange` (debounced) is unaffected because both fires happen in the same tick and the debounce queue overwrites the stale value before the 100ms timer fires |
| `onStaticPinPress` | `(evt) => void` | - | Tap on the pin (short press, under `longPressDuration`). The latest callback identity is observed on every render via `onPressRef`, so swapping `onStaticPinPress` after mount is honored |
| `onStaticPinLongPress` | `(evt) => void` | - | Long press on the pin. **Fires at release if held ≥ `longPressDuration`, NOT mid-hold** — `StaticPin.tsx`'s `onPanResponderRelease` computes `Date.now() - tapTime` at release and branches on the duration; no `setTimeout` is scheduled. This contrasts with content `onLongPress`, which fires mid-hold via `setTimeout` in `_handlePanResponderGrant`. Consumers wiring haptics or context menus to trigger mid-hold must use content `onLongPress`, not this pin-specific variant. The latest callback identity is observed on every render via `onLongPressRef`, so swapping `onStaticPinLongPress` after mount is honored |
| `pinProps` | `ViewProps` | `{}` | Extra props passed to pin wrapper. `style` is extracted and applied separately from other props. **`pinProps.style` has higher precedence than internal positioning styles** — it is placed last in the pin's style array (`[{left, top}, styles.pinWrapper, { opacity, transform: [translateY: -pinSize.height, translateX: -pinSize.width/2] }, pinStyle]`), so a consumer passing a `transform` key in `pinProps.style` will **entirely replace the internal anchor transforms** (React Native style arrays replace rather than merge conflicting keys), causing the pin to render from its top-left corner instead of bottom-center with no runtime error. Safe workaround for visual rotate/scale effects: wrap the pin icon content in a `View` and apply `transform` to that wrapper rather than through `pinProps.style` |

### External Animated Values

| Prop | Type | Description |
|------|------|-------------|
| `zoomAnimatedValue` | `Animated.Value` | Use an external zoom animated value (component won't stop its animation on unmount) |
| `panAnimatedValueXY` | `Animated.ValueXY` | Use an external pan animated value (component won't stop its animation on unmount) |

**Side effects on consumer-owned animated values.** Passing a pre-populated `Animated.Value`/`Animated.ValueXY` is not additive — the component mutates the object in three ways the consumer cannot opt out of:
1. **Mount-time reset:** the constructor unconditionally calls `this.panAnim.setValue({ x: initialOffsetX, y: initialOffsetY })` and `this.zoomAnim.setValue(initialZoom)` immediately after adopting the external value, overwriting any value the consumer set before mount.
2. **`zoomEnabled` `true→false` reset:** `componentDidUpdate` calls `this.zoomAnim.setValue(initialZoom)` on the transition (when `initialZoom` is truthy), snapping the consumer's external value regardless of the consumer's current animation.
3. **Four permanent listeners:** the constructor attaches `panListenerId` and `zoomListenerId`; `componentDidUpdate` attaches `panTransformListenerId` and `zoomTransformListenerId`. All four stay registered for the component's lifetime and fire on every gesture frame. The listeners are **passive observers** — `panListenerId` reads the current `{x, y}` into `this.offsetX`/`this.offsetY`, `zoomListenerId` reads the current value into `this.zoomLevel`, and the two transform listeners call `_invokeOnTransform()`; none of the listeners write back to the external animated object. The writes to `panAnim`/`zoomAnim` on every gesture frame originate in `_setNewOffsetPosition` (via `panAnim.setValue(...)`) and `_handlePinching` (via `zoomAnim.setValue(...)`), which call `setValue()` directly on the external object — the listeners fire as downstream passive recipients of those writes.

Consequences for shared-value patterns (synchronized carousels, interpolated overlays, multi-instance zoom sync): a value shared between this component and another consumer will be reset twice on mount (once by each component's constructor), written to on every gesture frame by each component's `_setNewOffsetPosition`/`_handlePinching` `setValue()` calls, and snapped to `initialZoom` whenever any consumer toggles `zoomEnabled` off. There is no prop to opt out of these side effects.

### Callbacks

Most callbacks receive `(event, gestureState, zoomableViewEventObject)`. Exceptions noted per row:

| Callback | When | Signature exception |
|----------|------|---------------------|
| `onTransform` | Every pan/zoom frame. Also fires from `componentDidUpdate`: **twice on first layout** (init block + measurements-changed block both execute in the same call — the init block sets `onTransformInvocationInitialized=true`, which immediately satisfies the measurements-changed block's guard), **once on rotation** (only the measurements-changed block runs), **once on programmatic `staticPinPosition` prop change**, and **once on `zoomEnabled` `true→false` transition** (when `initialZoom` is truthy — `componentDidUpdate` calls `zoomAnim.setValue(initialZoom)`, firing `zoomTransformListenerId`; see the `zoomEnabled` Prop row). Fires **once per pan frame, but twice per pinch frame** during active gestures because `_setNewOffsetPosition()` now updates only `panAnim`, while `_handlePinching()` still updates both `panAnim` and `zoomAnim`, each of which independently triggers `_invokeOnTransform()` via its listener. Also fires **once per call** from programmatic `moveTo()`/`moveBy()` — they now cancel in-flight `zoomTo()` animations via `zoomAnim.stopAnimation()` plus `zoomToListenerId` removal before routing through `_setNewOffsetPosition()`, so there is no extra zoom-listener cascade. Fires **once** from `moveStaticPinTo()` (per instant call, or per animation frame on the animated path — fires even though `moveStaticPinTo` bypasses `_setNewOffsetPosition`/`onShiftingBefore`/`After`). Additionally, `zoomTo(level, zoomCenter)` animation frames fire twice per frame with the first fire carrying stale `offsetX`/`offsetY` (see zoomTo() Listener Pattern). Consumers dispatching state updates should deduplicate. **First-layout vs rotation ordering relative to `onLayout`:** on first layout the three events interleave as `onTransform #1 → onLayout → onTransform #2` (the init block fires `_invokeOnTransform` before `onLayout` commits measurements; `onLayout` then saves them; the measurements-changed block fires a second `_invokeOnTransform` after). On rotation only one `onTransform` fires, and `onLayout` precedes it: `onLayout → onTransform`. Consumers guarding `onTransform` processing on an `onLayout`-set readiness flag work correctly only because the first-layout `onTransform #1` falls before the flag is set and is skipped; a consumer assuming the rotation ordering applies to first layout would be surprised | Receives only `ZoomableViewEvent` (no event/gestureState) |
| `onLayout` | Internal measurements change. See the `onTransform` row for ordering relative to `onTransform` on first layout (`onTransform #1 → onLayout → onTransform #2`) vs rotation (`onLayout → onTransform`) | Receives `{ nativeEvent: { layout } }` |
| `onSingleTap` | Single tap confirmed (after double-tap delay) | `(event, zoomableViewEventObject)` — no gestureState |
| `onDoubleTapBefore` | Before double-tap zoom executes | `(event, zoomableViewEventObject)` — no gestureState |
| `onDoubleTapAfter` | After double-tap zoom executes (fires synchronously before animation runs). `zoomLevel` in the event is overridden to the TARGET zoom level, not the current pre-animation level; `offsetX`/`offsetY` still reflect pre-animation state | `(event, zoomableViewEventObject)` — no gestureState |
| `onLongPress` | Long press detected | |
| `onShiftingBefore` | Before pan frame applies. Return `true` to block | `event` and `gestureState` are `null` — null-guard required |
| `onShiftingAfter` | After pan frame applies. **Return value is ignored** — unlike `onShiftingBefore` (where returning `true` blocks the frame), `onShiftingAfter`'s declared `boolean` return type is misleading; the call site does not capture it, so returning `true` has no effect | `event` and `gestureState` are `null` — null-guard required |
| `onShiftingEnd` | Pan gesture ends. **Fires based on `gestureType` classification, not on whether any pan frame was actually applied.** `gestureType` is set to `'shift'` as soon as a 1-finger move exceeds 2px on either axis — BEFORE any blocking check runs. Blocking checks (`panEnabled=false`, `disablePanOnInitialZoom` at `initialZoom`, or `onShiftingBefore` returning `true`) cause `_handleShifting` / `_setNewOffsetPosition` to return early without clearing `gestureType`. At gesture end `onShiftingEnd` still fires because `gestureType === 'shift'`. Consumers using these flags as a pan lock will receive `onShiftingEnd` after every >2px finger movement even though zero pan frames were applied. | |
| `onZoomBefore` | Fires on every pinch frame (real event/gestureState) AND at start of `zoomTo()` (null, null). Return `true` blocks pinch frames only — ignored during `zoomTo()`. **Blocked pinch frames do NOT update the gesture-tracking reference values** `lastGestureTouchDistance` or `lastGestureCenterPosition`: `_handlePinching` returns at line 617 before reaching `this.lastGestureTouchDistance = distance` (line 626) or the `_calcOffsetShiftSinceLastGestureState(gestureCenterPoint)` call at line 697 (which is where `lastGestureCenterPosition` is updated). If the consumer blocks several consecutive frames and then stops blocking (conditional mid-gesture gating), the next unblocked frame computes `distance / lastGestureTouchDistance` and `dx/dy` against stale references captured before the block, producing a sudden **zoom jump AND pan-center jump** equal to the accumulated blocked delta. Workaround: prefer coarse gating (use `zoomEnabled={false}` or a parent-level responder block) over mid-gesture `onZoomBefore` blocks, or accept that unblock transitions will produce a single-frame jump. | During `zoomTo()`: `event` and `gestureState` are `null` — null-guard required |
| `onZoomAfter` | After each pinch frame (real event/gestureState) AND after `zoomTo()` completes naturally (null, null). During `zoomTo()`, it does not fire on interrupted/cancelled animations or after unmount; the event reflects the final post-animation state, and any pending static-pin change has already been flushed | During `zoomTo()`: `event` and `gestureState` are `null` — null-guard required |
| `onZoomEnd` | Pinch gesture ends | |
| `onPanResponderGrant` | Gesture responder acquired | |
| `onPanResponderEnd` | Gesture responder released — fires on normal release AND as the first step of termination (the terminate handler calls `_handlePanResponderEnd` before firing `onPanResponderTerminate`) | |
| `onPanResponderMove` | Every move frame. Return `true` to intercept (prevents default handling) | |
| `onPanResponderTerminate` | Responder taken by another component. **Not** mutually exclusive with `onPanResponderEnd`: on termination, `onPanResponderEnd` fires first, then (if `gestureType==='pinch'`) `onZoomEnd` or (if `gestureType==='shift'`) `onShiftingEnd`, then any pending `onStaticPinPositionChange` is synchronously flushed (if `staticPinPosition`, `contentWidth`, and `contentHeight` are configured), then `onPanResponderTerminate`. Synchronous callback count per termination (excluding `onStaticPinPositionChange`): **3 when `gestureType` is `'pinch'` or `'shift'`; 2 when `gestureType` is `null` and the tap resolves as a first tap (singleTapTimeoutId scheduled for async fire, no synchronous tap callbacks); 5 when `gestureType` is `null` and the tap resolves as a double-tap (`onDoubleTapBefore` + `onZoomBefore` + `onDoubleTapAfter` fire synchronously inside `_handlePanResponderEnd` before `onPanResponderTerminate`); 4 when `gestureType` is `null` on the double-tap path with `zoomEnabled=false` (`onZoomBefore` skipped via `zoomTo`'s early return)**. Add **+1** when a pending static-pin change exists and the flush emits. `onZoomAfter` is no longer part of the synchronous termination sequence; it fires later only if the `zoomTo()` animation finishes naturally and the component is still mounted. | |
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
Move the viewport so a specific position in the zoom subject is centered. **Requires layout measurement to have completed** — the method reads `originalWidth`/`originalHeight` from state and silently no-ops (returns with no error) if either is `0` (i.e., before `onLayout` fires). Calls from `componentDidMount`, from `useEffect` with empty deps, or from refs before first layout will be silently dropped. Fires `onShiftingBefore`/`onShiftingAfter` via `_setNewOffsetPosition`, and fires `onTransform` **once per call** via the `panAnim` update. **Not gated by `panEnabled` or `disablePanOnInitialZoom`** — those only apply to gesture-driven panning; programmatic calls pan freely. **Cancels in-flight `zoomTo()` animations silently before applying the pan** — `moveTo()` now calls `zoomAnim.stopAnimation()` and removes any active `zoomToListenerId` first, so the next zoom frame cannot overwrite the requested offset. The stopped zoom level is then used for the move calculation.

### `moveBy(offsetChangeX: number, offsetChangeY: number): void`
Shift the viewport by a pixel offset. Unlike `moveTo()`, has no layout-measurement prerequisite — works immediately on mount because it operates on current offset values, not measured dimensions. Fires `onShiftingBefore`/`onShiftingAfter` via `_setNewOffsetPosition`, and fires `onTransform` **once per call** via the `panAnim` update. **Not gated by `panEnabled` or `disablePanOnInitialZoom`** — same caveat as `moveTo()`. **Cancels in-flight `zoomTo()` animations silently before applying the pan** — same `zoomAnim.stopAnimation()` + `zoomToListenerId` removal path as `moveTo()`.

### `moveStaticPinTo(position: Vec2D, duration?: number): void`
Pan the view so the static pin points at `position` in content coordinates. Requires `staticPinPosition`, `contentWidth`, and `contentHeight` to be set. If `duration` is truthy, animates the pan via `Animated.timing`; **any falsy `duration` (`0`, `undefined`, `null`) takes the instant `panAnim.setValue()` path** — the code uses a plain `if (duration)` guard, so `duration=0` does NOT produce a 0ms animated path, it takes the synchronous path. Same falsy-guard trap pattern as `doubleTapDelay=0` and `movementSensibility=0`. **Does not fire `onShiftingBefore`/`onShiftingAfter`** — sets offsets directly without routing through `_setNewOffsetPosition`, bypassing the onShifting gate entirely. Unlike `moveTo()`/`moveBy()`, consumers' `onShiftingBefore` gate cannot block this method. **Still fires `onTransform` once per instant call, or once per animation frame for the animated path** (via the direct `panAnim.setValue()` call). **Not gated by `panEnabled` or `disablePanOnInitialZoom`** — bypasses both flags via direct `panAnim` manipulation without routing through `_handleShifting`. **Does NOT cancel in-flight `zoomTo(level, zoomCenter)` animations** — unlike `moveTo()`/`moveBy()`, this method only touches `panAnim` and never calls the programmatic-pan cancellation path (`zoomAnim.stopAnimation()` + `zoomToListenerId` removal). On the next `zoomAnim` animation frame, the zoomTo listener calls `panAnim.setValue()` with a zoom-centered position. The consequence differs between the instant and animated paths: (a) **instant path (`duration` falsy):** `panAnim.setValue()` places the pin synchronously, and ~16ms later the zoomTo listener overwrites that alignment with a zoom-centered position; (b) **animated path (`duration` truthy):** `Animated.timing` is **cancelled** by the zoomTo listener's `panAnim.setValue()` call (React Native's `setValue` implicitly calls `stopAnimation()`) before the pin reaches its target. Additionally, `panListenerId` has updated `this.offsetX`/`this.offsetY` to **intermediate animation values** during the ~16ms before cancellation, so the zoom centering is computed from a stale intermediate position, not from the `moveStaticPinTo` target. The animated path provides no consumer-visible cancellation signal — `Animated.timing(...).start()` is invoked without a completion callback. To reliably reposition during a zoom animation, call `moveTo()`/`moveBy()` first (which now stops the zoom animation before panning) or wait for `zoomTo()` to complete before calling `moveStaticPinTo()`.

### `gestureStarted: boolean` (read-only)
Whether a gesture is currently in progress. Useful for consumers to suppress their own updates during active interaction. **Caveat:** `gestureStarted` is reset to `false` as the **last** operation of `_handlePanResponderEnd` — it remains `true` throughout the synchronous end-callback sequence. For a **double-tap release** the synchronous sequence is `onDoubleTapBefore`, `onZoomBefore`, `onDoubleTapAfter`, `onPanResponderEnd`, then any flushed `onStaticPinPositionChange` — all before `gestureStarted` is reset, because `_resolveAndHandleTap` runs synchronously inside `_handlePanResponderEnd` (before the reset). `onZoomAfter` no longer participates in this synchronous sequence; it fires later only after the `zoomTo()` animation finishes naturally, by which point `gestureStarted` is already `false`. `onZoomEnd`/`onShiftingEnd` do **not** fire on the double-tap path because both are gated on `gestureType === 'pinch'` / `'shift'`, but double-tap runs only when `gestureType === null`. For **pinch or pan gesture releases** the sequence is `onPanResponderEnd`, then `onZoomEnd` (if `gestureType==='pinch'`) or `onShiftingEnd` (if `gestureType==='shift'`), then any flushed `onStaticPinPositionChange`. Consumers cannot read `gestureStarted` inside any of these synchronous callbacks to distinguish "gesture ending" from "mid-gesture."

---

## Gesture System

Uses `PanResponder` with `onStartShouldSetPanResponder: true` (always claims the gesture). Gesture classification happens during movement:

### Classification Rules
- **1 finger, moved >2px**: `gestureType = 'shift'` (pan)
- **2 fingers**: `gestureType = 'pinch'` (zoom)
- **3+ fingers**: Gesture ends (via `_handlePanResponderEnd`), only 1-2 touch supported. **`_handlePanResponderEnd` is invoked twice** for any 3+-finger interaction: once synchronously from the 3+-finger branch in `_handlePanResponderMove` (line 537), and a second time from the natural `onPanResponderRelease`/`onPanResponderTerminate` when the user lifts fingers. The first call resets `gestureType` to `null` (line 501), so the second call satisfies `if (!this.gestureType)` at line 464 and unconditionally invokes `_resolveAndHandleTap`. Two concrete consumer-visible consequences follow: (A) placing 3+ fingers simultaneously with no prior movement triggers spurious tap resolution. **Primary outcome — quick touch (fingers lifted within `doubleTapDelay` of the move-handler call, the typical case):** Call 1 of `_handlePanResponderEnd` enters the else-branch of `_resolveAndHandleTap`, setting `doubleTapFirstTapReleaseTimestamp=T1` and scheduling `singleTapTimeoutId`. Call 2 then finds the timestamp, cancels the pending timeout, and fires `onDoubleTapBefore` + full zoom animation + `onDoubleTapAfter` — this is the **default** behavior, driven by Call 1 creating the timestamp that Call 2 detects within the same gesture (no prior user tap is required). **Edge case — slow hold (fingers held longer than `doubleTapDelay` before lifting):** Call 1's timeout expires and fires `onSingleTap` once; Call 2 then finds a cleared timestamp, re-enters the else-branch, schedules a second timeout, and fires **a second `onSingleTap`** — two spurious `onSingleTap` callbacks total, not one; (B) **`onPanResponderEnd` fires twice per 3+-finger release** (once per `_handlePanResponderEnd` call) but **`onZoomEnd`/`onShiftingEnd` fires exactly once** — only during the first call, while `gestureType` is still `'pinch'`/`'shift'`; the first call then resets `gestureType=null` (line 501), so when the second call reads it the guard fails and neither zoom-end nor shifting-end callback fires again. Any pending `onStaticPinPositionChange` is flushed at the end of each `_handlePanResponderEnd` call, but only the first flush normally emits because it drains the debounce timer; unlike the old `_updateStaticPin` path, 3+-finger releases no longer guarantee a double-fire of `onStaticPinPositionChange`. Consumers deduplicating end-callback counts should scope deduplication to `onPanResponderEnd` only — **applying the same deduplication to `onZoomEnd`/`onShiftingEnd` would suppress the single legitimate fire**, since they are not double-fired; (C) when a **classified gesture** (`gestureType='shift'` or `'pinch'`) is interrupted by a 3rd finger, the first `_handlePanResponderEnd` call skips `_resolveAndHandleTap` (because `gestureType` is non-null) but resets `gestureType=null` at line 501; the second call (on finger lift) then satisfies `!this.gestureType` and unconditionally invokes `_resolveAndHandleTap`. The outcome depends on whether a prior single-tap within `doubleTapDelay` left a `doubleTapFirstTapReleaseTimestamp` (not cleared by `_handlePanResponderGrant`): (C1) **no prior timestamp (the common case):** the else branch fires — scheduling `singleTapTimeoutId` — and a spurious `onSingleTap` fires `doubleTapDelay` ms after all fingers lift; (C2) **prior single-tap within `doubleTapDelay` (e.g., the user tapped, then immediately started a pinch/pan, then a 3rd finger joined):** the second call's `_resolveAndHandleTap` finds the timestamp still valid, cancels any pending timeout, and fires the **double-tap zoom path** — `onDoubleTapBefore`, `onZoomBefore`, `onDoubleTapAfter` + full zoom animation — instead of scheduling `singleTapTimeoutId`. This is distinct from (A), which covers the no-prior-movement case where both calls enter tap resolution. Any consumer using `onSingleTap` for navigation/selection will see it fire unexpectedly after a pan or pinch gesture interrupted by an accidental 3rd finger, and a prior-tap consumer may see a spurious full double-tap zoom instead.
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
- **When `zoomEnabled` is `false`:** `_handlePinching` returns immediately before any *frame* callback fires — **no** `onZoomBefore` or `onZoomAfter` runs for pinch gestures. **However, `onZoomEnd` still fires** at gesture end: `gestureType` is set to `'pinch'` unconditionally at line 559 **before** `_handlePinching` is invoked and is not cleared by `_handlePinching`'s early return at line 598, so `_handlePanResponderEnd`'s `if (this.gestureType === 'pinch')` check passes and `onZoomEnd` fires. This is analogous to the `onShiftingEnd` caveat above (line 106): end-callbacks fire based on classification, not on whether any frame was actually applied. `onZoomBefore`/`onZoomAfter` ALSO do not fire for double-tap attempts when `zoomEnabled=false`, because `zoomTo()` returns early at its first guard (line 1042, `if (!this.props.zoomEnabled) return false`) BEFORE reaching `onZoomBefore` at line 1046. However, `_handleDoubleTap` is asymmetric with pinch in a different dimension: the double-tap-specific callbacks `onDoubleTapBefore` and `onDoubleTapAfter` still fire (with a synthetic payload) despite `zoomTo()` bailing out — see Double-Tap Zoom § zoomEnabled=false. Net result: a consumer using `onZoomBefore` for analytics during a locked period sees no events at all (both pinch and double-tap paths bypass it); `onZoomEnd` still fires once per pinch attempt; a consumer using the `onDoubleTapBefore`/`onDoubleTapAfter` pair sees spurious matched pairs even though the view did not change.

### Double-Tap Zoom
- Advances zoom level as `currentLevel × (1 + zoomStep)` (multiplicative — e.g., `zoomStep=0.5` zooms 50% above current level), with three possible return paths in `_getNextZoomStep()`:
  1. If the computed next step **overshoots `maxZoom`**, it is **clamped to `maxZoom`** (intermediate step, not `initialZoom`)
  2. When already at `maxZoom` (detected via `zoomLevel.toFixed(2) === maxZoom.toFixed(2)` — 2-decimal precision, ~0.005 tolerance), returns `initialZoom`
  3. Otherwise returns the computed step
- Example cycle for `initialZoom=1, maxZoom=2, zoomStep=0.5`: `1 → 1.5 → 2 (clamped, not 2.25) → 1 → ...` — three distinct cycle states, not two
- **When `maxZoom` is `null`:** double-tap zoom still works. `_getNextZoomStep()` derives an `effectiveMax` of `(initialZoom ?? 1) * (1 + zoomStep)^3`, so the double-tap cycle becomes `initialZoom → step 1 → step 2 → step 3 → initialZoom` instead of growing indefinitely. Pinch zoom remains unlimited.
- **When `zoomStep` is `null`:** double-tap zoom is disabled **only when not at the effective max** — the guard ordering matters. `_getNextZoomStep()` checks `zoomLevel == maxZoom` BEFORE `zoomStep == null`, so with a configured `maxZoom`, being at max still resets to `initialZoom`: both `onDoubleTapBefore` and `onDoubleTapAfter` fire, and `zoomTo(initialZoom)` runs with a real animation. At non-maxZoom levels, `zoomStep=null` returns `undefined` (only `onDoubleTapBefore` fires). This is distinct from `maxZoom=null`, which now cycles back using the derived three-step ceiling instead of disabling double-tap entirely.
- **When `zoomEnabled` is `false`:** BOTH `onDoubleTapBefore` AND `onDoubleTapAfter` fire despite no zoom animation running. `_getNextZoomStep()` does not check `zoomEnabled`, so it returns a valid next step; `zoomTo()` is then called, bails out early (`!this.props.zoomEnabled` returns `false`), but `_handleDoubleTap` does not check the return value and fires `onDoubleTapAfter` unconditionally with a synthetic `zoomLevel` override equal to the would-be target. Consumers relying on the Before/After pair as a state-change signal will see a matched pair indistinguishable from a successful zoom even though the view did not change.
- Zoom center = tap position. When `doubleTapZoomToCenter` is set, the zoom anchor is the true viewport center: `{x: originalWidth/2, y: originalHeight/2}`
- Uses `zoomTo()` internally

### zoomTo() Listener Pattern
When `zoomTo` is called with a `zoomCenter`, a listener on `zoomAnim` dynamically adjusts `panAnim` on each animation frame to keep the center point stable. The listener is cleaned up on animation completion. Rapid successive `zoomTo()` calls (e.g., fast double-taps) remove the previous listener before adding a new one to prevent permanent leaks.

**Animation-frame `onTransform` double-fire with stale pan values:** During a `zoomTo(level, zoomCenter)` animation, each zoom frame triggers listeners on `zoomAnim` in registration order: (1) `zoomListenerId` updates `this.zoomLevel`, (2) `zoomTransformListenerId` calls `_invokeOnTransform()` — **this fire carries the new `zoomLevel` but stale `offsetX`/`offsetY`** because `panAnim` has not yet been updated, (3) the `zoomTo` listener calls `panAnim.setValue(new_pan)`, (4) `panListenerId` updates `this.offsetX`/`this.offsetY`, (5) `panTransformListenerId` calls `_invokeOnTransform()` again with all values correct. Net result: `onTransform` fires twice per animation frame, the first with a chimera state. `zoomTo(level)` without a `zoomCenter` fires only once per frame (no panAnim adjustment). State machines reading `zoomLevel + offsetX` from the first fire will see an invalid combination that never existed as a stable component state.

---

## Pan / Shift Behavior

- Gesture panning is disabled when `panEnabled = false` or when `disablePanOnInitialZoom = true` and zoom is at `initialZoom`. **These flags only gate gesture-driven panning via `_handleShifting`** — four non-gesture pan paths bypass both flags entirely: (1) `moveTo` and (2) `moveBy` route through `_setNewOffsetPosition` which has no `panEnabled`/`disablePanOnInitialZoom` check, gated only by `onShiftingBefore`; (3) `moveStaticPinTo` manipulates `panAnim` directly and has no gates at all; (4) the Single-Tap Pan-to-Pin 200ms animation (when `staticPinPosition` is set) calls `Animated.timing(panAnim, ...)` directly from the `_resolveAndHandleTap` setTimeout callback, bypassing `_handleShifting`, `_setNewOffsetPosition`, `panEnabled`, `disablePanOnInitialZoom`, and `onShiftingBefore`/`onShiftingAfter`
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
- `onStaticPinPositionMove`: fires on every `onTransform` frame with the pin's content-space position (via `viewportPositionToImagePosition`). **Inherits `onTransform`'s trigger caveats:** fires once per pan frame, twice per pinch frame during active gestures, also fires from `componentDidUpdate` on layout measurement changes (first layout, rotation) and programmatic `staticPinPosition` prop changes, and fires from programmatic `moveTo()`/`moveBy()` (once per call, after cancelling any active `zoomTo()` before applying the pan) and `moveStaticPinTo()` (once per instant call, or per animation frame)
- `onStaticPinPositionChange`: has two call paths:
  - **Debounced (100ms):** Fired via `_invokeOnTransform` from every site that calls it — active gesture frames, single-tap pan animation frames (when `staticPinPosition` is set, the 200ms animation documented in Single-Tap Pan-to-Pin fires `_invokeOnTransform` on every JS frame), `componentDidUpdate` on layout measurement changes (first layout, rotation) and programmatic `staticPinPosition` prop changes, and programmatic `moveTo()`/`moveBy()`/`moveStaticPinTo()` calls (same trigger surface as `onStaticPinPositionMove`). Uses lodash `debounce`, cancelled on unmount
  - **Flushed pending delivery:** Gesture end, single-tap pan animation completion, and natural `zoomTo()` completion all call `debouncedOnStaticPinPositionChange.flush()` instead of issuing a separate direct callback. `flush()` synchronously delivers at most one pending debounced call and clears the timer, so the gesture-end and single-tap completion paths no longer double-fire. **`gestureStarted` is NOT yet reset to `false` during the gesture-end flush** — `_handlePanResponderEnd` calls `flush()` before setting `this.gestureStarted = false`, so consumers still cannot use `ref.current.gestureStarted` inside that synchronous delivery to distinguish "gesture ending" from "mid-gesture." In contrast, the `zoomTo()` completion flush happens later, after the animation, when `gestureStarted` is already `false`.
- Both callbacks require `contentWidth` and `contentHeight` to be set

### Single-Tap Pan-to-Pin
When `staticPinPosition` is set and user single-taps the content (not the pin), the view animates (200ms) to center on the tap position relative to the pin. If the animation completes (`finished === true`) and the component is still mounted, the pending debounced `onStaticPinPositionChange` is synchronously flushed at animation completion. **During the 200ms animation, `panTransformListenerId` fires `_invokeOnTransform()` on every JS frame** (~12 frames at 60fps), generating per-frame calls to `onTransform`, `onStaticPinPositionMove`, and `debouncedOnStaticPinPositionChange`. The completion path delivers only the final flushed `onStaticPinPositionChange`, not a second separate immediate callback.

---

## Tap Handling

Tap resolution runs when no gesture type was classified (no movement detected). **Ordering:** `_resolveAndHandleTap` is called synchronously inside `_handlePanResponderEnd` *before* the `onPanResponderEnd` consumer callback fires. For a double-tap, the synchronous tap callbacks are `onDoubleTapBefore`, `onZoomBefore`, and `onDoubleTapAfter`; `onZoomAfter` now arrives later, only if the `zoomTo()` animation finishes naturally. For a single-tap, the `singleTapTimeoutId` is *scheduled* before `onPanResponderEnd` fires, but the actual `onSingleTap` callback arrives asynchronously after `doubleTapDelay` ms — so `onPanResponderEnd` fires approximately `doubleTapDelay` ms *before* `onSingleTap` and can serve as a pre-tap hook for single-tap. The blanket "cannot use `onPanResponderEnd` as a pre-tap hook" only applies to the synchronous double-tap callbacks.

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
- `zoomTo()` animation completion callback
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
- `pinProps.style` is now extracted and applied as a separate style layer (previously spread as-is). **Precedence caveat:** the style layer is placed last, overriding internal anchor transforms — passing `transform` in `pinProps.style` will break pin positioning. See the `pinProps` row for the safe wrapper-`View` workaround
- Drag threshold changed from `Math.abs(dx) > 5 AND Math.abs(dy) > 5` to `Math.abs(dx) > 5 OR Math.abs(dy) > 5` — drags are detected earlier (on any single axis exceeding 5px absolute, not both)

### Behavior Changes
- `stopAnimation` on gesture start now uses callbacks to capture final values — prevents offset drift that could occur when animations were stopped without reading their final state
- `onStaticPinPositionChange` after single-tap pan only fires when animation finishes AND component is mounted — previously could fire post-unmount

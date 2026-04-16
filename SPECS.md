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
| `zoomEnabled` | `boolean` | `true` | Enable/disable zooming dynamically |
| `panEnabled` | `boolean` | `true` | Enable/disable panning dynamically |
| `initialZoom` | `number` | `1` | Zoom level on startup |
| `maxZoom` | `number` | `1.5` | Maximum zoom level. `null` = unlimited |
| `minZoom` | `number` | `0.5` | Minimum zoom level |
| `initialOffsetX` | `number` | `0` | Starting horizontal offset |
| `initialOffsetY` | `number` | `0` | Starting vertical offset |
| `zoomStep` | `number` | `0.5` | Zoom increment on double tap |
| `pinchToZoomInSensitivity` | `number` | `1` | Resistance to zoom in (0-10, higher = less sensitive) |
| `pinchToZoomOutSensitivity` | `number` | `1` | Resistance to zoom out (0-10, higher = less sensitive) |
| `movementSensibility` | `number` | `1` | Pan movement resistance (0.5-5, higher = less sensitive) |
| `disablePanOnInitialZoom` | `boolean` | `false` | Block panning when at initial zoom level |
| `doubleTapDelay` | `number` | `300` | Max ms between taps for double-tap detection |
| `doubleTapZoomToCenter` | `boolean` | - | Double tap always zooms to view center instead of tap point |

### Content Dimensions

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `contentWidth` | `number` | `undefined` | Logical content width (used for `moveStaticPinTo` coordinate math) |
| `contentHeight` | `number` | `undefined` | Logical content height |

### Long Press & Touch

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `longPressDuration` | `number` | `700` | ms until press becomes long press |
| `visualTouchFeedbackEnabled` | `boolean` | `true` | Show animated circle on tap |

### Static Pin

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `staticPinPosition` | `Vec2D` | `undefined` | Pin position in content coordinates. Enables the pin when set |
| `staticPinIcon` | `ReactElement` | built-in pin image | Custom pin icon |
| `onStaticPinPositionChange` | `(pos: Vec2D) => void` | - | Debounced (100ms) callback when pin's content position changes after gestures |
| `onStaticPinPositionMove` | `(pos: Vec2D) => void` | - | Fires on every transform frame with pin's current content position |
| `onStaticPinPress` | `(evt) => void` | - | Tap on the pin (short press, under `longPressDuration`) |
| `onStaticPinLongPress` | `(evt) => void` | - | Long press on the pin |
| `pinProps` | `ViewProps` | `{}` | Extra props passed to pin wrapper. `style` is extracted and applied separately from other props |

### External Animated Values

| Prop | Type | Description |
|------|------|-------------|
| `zoomAnimatedValue` | `Animated.Value` | Use an external zoom animated value (component won't stop its animation on unmount) |
| `panAnimatedValueXY` | `Animated.ValueXY` | Use an external pan animated value (component won't stop its animation on unmount) |

### Callbacks

All callbacks receive `(event, gestureState, zoomableViewEventObject)` unless noted:

| Callback | When |
|----------|------|
| `onTransform` | Every pan/zoom frame. Receives only `ZoomableViewEvent` |
| `onLayout` | Internal measurements change. Receives `{ nativeEvent: { layout } }` |
| `onSingleTap` | Single tap confirmed (after double-tap delay) |
| `onDoubleTapBefore` | Before double-tap zoom executes |
| `onDoubleTapAfter` | After double-tap zoom executes |
| `onLongPress` | Long press detected |
| `onShiftingBefore` | Before pan frame applies. Return `true` to block |
| `onShiftingAfter` | After pan frame applies |
| `onShiftingEnd` | Pan gesture ends |
| `onZoomBefore` | Before pinch-zoom frame. Return `true` to block |
| `onZoomAfter` | After pinch-zoom frame |
| `onZoomEnd` | Pinch gesture ends |
| `onPanResponderGrant` | Gesture responder acquired |
| `onPanResponderEnd` | Gesture responder released |
| `onPanResponderMove` | Every move frame. Return `true` to intercept (prevents default handling) |
| `onPanResponderTerminate` | Responder taken by another component |
| `onPanResponderTerminationRequest` | Another component wants responder. Return `true` to allow |
| `onShouldBlockNativeResponder` | Block native responder. Default: `true` |
| `onStartShouldSetPanResponderCapture` | Capture phase for start |
| `onMoveShouldSetPanResponderCapture` | Capture phase for move |

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
Animate to a specific zoom level. `zoomCenter` specifies the point (relative to zoom subject center) that stays fixed on screen during the zoom. Returns `false` if zoom is disabled or level is out of bounds.

### `zoomBy(zoomLevelChange: number): boolean`
Zoom by a delta from current level. Defaults to `zoomStep` if no delta given.

### `moveTo(newOffsetX: number, newOffsetY: number): void`
Move the viewport so a specific position in the zoom subject is centered.

### `moveBy(offsetChangeX: number, offsetChangeY: number): void`
Shift the viewport by a pixel offset.

### `moveStaticPinTo(position: Vec2D, duration?: number): void`
Pan the view so the static pin points at `position` in content coordinates. Requires `staticPinPosition`, `contentWidth`, and `contentHeight` to be set. If `duration` is provided, animates the pan; otherwise instant.

### `gestureStarted: boolean` (read-only)
Whether a gesture is currently in progress. Useful for consumers to suppress their own updates during active interaction.

---

## Gesture System

Uses `PanResponder` with `onStartShouldSetPanResponder: true` (always claims the gesture). Gesture classification happens during movement:

### Classification Rules
- **1 finger, moved >2px**: `gestureType = 'shift'` (pan)
- **2 fingers**: `gestureType = 'pinch'` (zoom)
- **3+ fingers**: Gesture ends (via `_handlePanResponderEnd`), only 1-2 touch supported
- **No movement**: `gestureType` stays `null` → treated as tap on release

### Gesture Lifecycle
1. `onPanResponderGrant` → Stop all in-flight animations (capturing final values via `stopAnimation` callback), set `gestureStarted = true`, start long-press timer
2. `onPanResponderMove` → Classify gesture, dispatch to `_handlePinching` or `_handleShifting`
3. `onPanResponderEnd` / `onPanResponderTerminate` → If no gesture type, resolve as tap. Fire end callbacks. Update static pin position. Reset state.

### Gesture-to-Shift Transition
When switching from pinch to shift (or vice versa), `lastGestureCenterPosition` is recalculated at the transition boundary to prevent a jump. The center point resets so the delta calculation starts fresh.

---

## Zoom Behavior

### Pinch Zoom
- Zoom center = midpoint of two touches (or `staticPinPosition` if pin is active — keeps pin stable during zoom)
- Sensitivity formula: `deltaGrowth * (1 - sensitivity * 9 / 100)` where `sensitivity` is 0-10
- Offset recalculated each frame to keep the zoom center visually stable
- Min/max zoom enforced per frame

### Double-Tap Zoom
- Cycles between current level + `zoomStep` and `initialZoom`
- When at `maxZoom`, returns to `initialZoom`
- Zoom center = tap position (or view center if `doubleTapZoomToCenter`)
- Uses `zoomTo()` internally

### zoomTo() Listener Pattern
When `zoomTo` is called with a `zoomCenter`, a listener on `zoomAnim` dynamically adjusts `panAnim` on each animation frame to keep the center point stable. The listener is cleaned up on animation completion. Rapid successive `zoomTo()` calls (e.g., fast double-taps) remove the previous listener before adding a new one to prevent permanent leaks.

---

## Pan / Shift Behavior

- Pan is disabled when `panEnabled = false` or when `disablePanOnInitialZoom = true` and zoom is at `initialZoom`
- Movement is scaled by `1 / zoomLevel / movementSensibility` — at higher zoom, the same finger movement produces less content shift
- No momentum/decay — pan stops immediately when finger lifts
- No boundary clamping — content can be panned freely without bounds

### onShiftingBefore Gate
If the consumer's `onShiftingBefore` callback returns `true`, the pan frame is silently dropped. This allows consumers to conditionally block panning.

---

## Static Pin

The static pin is a draggable overlay positioned at `staticPinPosition` in content coordinates. It renders as an `Animated.View` positioned absolutely within the zoom container.

### Pin Positioning
- CSS position: `left: staticPinPosition.x`, `top: staticPinPosition.y`
- Transform: `translateY: -pinSize.height` (anchors bottom of pin to position), `translateX: -pinSize.width / 2` (centers horizontally)
- Pin is invisible (`opacity: 0`) until its layout is measured

### Pin Gesture Handling (StaticPin.tsx)

StaticPin has its own `PanResponder` that intercepts touches on the pin before the parent:

**Touch classification:**
- `onStartShouldSetPanResponder` → always `true` (pin claims all touches)
- Resets `hasDragged` and `parentNotified` refs on each new touch

**Drag threshold:** 5px in either axis (`dx > 5 || dy > 5`, using OR not AND)

**Drag-to-parent handoff:**
1. Once threshold crossed, `hasDragged = true`, calls `onParentMove` (parent's `_handlePanResponderMove`)
2. If parent returns `undefined` (normal 1-2 finger handling), sets `parentNotified = true`
3. If parent returns `true` (3+ finger branch that internally called `_handlePanResponderEnd`), `parentNotified = false` — prevents spurious `onParentRelease` on finger lift

**Release behavior:**
- If `parentNotified`: calls `onParentRelease` (parent's `_handlePanResponderEnd`) — completes the pan gesture properly
- If `hasDragged` but NOT `parentNotified`: silently drops (drag was handled by 3+ finger path)
- If no drag: evaluates as tap or long press based on `Date.now() - tapTime` vs `longPressDuration`

**Terminate behavior:**
- If `parentNotified`: calls `onParentTerminate` (parent's `_handlePanResponderEnd` + `onPanResponderTerminate` callback)

### Pin Position Updates
- `onStaticPinPositionMove`: fires on every `onTransform` frame with the pin's content-space position (via `viewportPositionToImagePosition`)
- `onStaticPinPositionChange`: same calculation but debounced at 100ms (lodash `debounce`, cancelled on unmount)
- Both require `contentWidth` and `contentHeight` to be set

### Single-Tap Pan-to-Pin
When `staticPinPosition` is set and user single-taps the content (not the pin), the view animates (200ms) to center on the tap position relative to the pin. The `_updateStaticPin` callback only fires if the animation completes (`finished === true`) and the component is still mounted.

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
`staticPinPosition`, `contentWidth`, `contentHeight`, and `moveStaticPinTo` all operate in "content coordinates" — the logical pixel space of the content being zoomed. Origin is top-left of the content.

### Viewport-to-Image Conversion
`viewportPositionToImagePosition` converts a viewport pixel position to content coordinates, accounting for current zoom, offset, and measured dimensions. Used to compute the pin's logical position after every transform.

### Zoom Center Coordinates
In `zoomTo()` and double-tap, zoom center is relative to the zoom subject's center: `{ x: 0, y: 0 }` = dead center of the zoom subject.

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
- `Vec2D` type removed from internal usage (still exported from typings)

### StaticPin API Changes
- `pinAnim` prop removed — no longer needed
- `onParentRelease` prop added — StaticPin now properly completes the parent gesture on release
- `onParentTerminate` prop added — StaticPin handles responder termination correctly
- `longPressDuration` prop added — uses parent's duration instead of hardcoded 500ms
- `pinProps.style` is now extracted and applied as a separate style layer (previously spread as-is)
- Drag threshold changed from `dx > 5 AND dy > 5` to `dx > 5 OR dy > 5` — drags are detected earlier (on any single axis exceeding 5px, not both)

### Behavior Changes
- `stopAnimation` on gesture start now uses callbacks to capture final values — prevents offset drift that could occur when animations were stopped without reading their final state
- `onStaticPinPositionChange` after single-tap pan only fires when animation finishes AND component is mounted — previously could fire post-unmount

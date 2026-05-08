import React, { createContext, ReactNode, RefObject, useContext } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import { DerivedValue, SharedValue } from 'react-native-reanimated';

type ZoomableViewContextValue = {
  zoom: SharedValue<number>;
  inverseZoom: DerivedValue<number>;
  // A style that applies the inverse zoom level, so children stay the same
  // visual size when zooming. The `scale` value is a Reanimated `SharedValue`
  // (animated inline) — apply this style to `Animated.View` only. The type
  // intentionally surfaces `SharedValue<number>` rather than `number` so
  // TypeScript flags accidental application to a plain RN `View`.
  inverseZoomStyle: { transform: { scale: SharedValue<number> }[] };
  offsetX: SharedValue<number>;
  offsetY: SharedValue<number>;
  // Stable RNGH ref for the parent's pan/pinch `Gesture.Manual()`, attached
  // via `.withRef(parentGestureRef)`. Consumers nesting their own
  // `GestureDetector` inside `staticPinIcon` (or anywhere inside the zoom
  // subject) can compose against it — typically with
  // `myGesture.blocksExternalGesture(parentGestureRef)` so the parent FAILs
  // when the child activates, preventing the canvas from panning while a
  // child Pan / Rotation / etc. is running. RNGH does NOT auto-coordinate
  // across `GestureDetector` boundaries, so without this composition the
  // parent and child both run concurrently and both write their state.
  parentGestureRef: RefObject<GestureType | undefined>;
  // Debug counter — increments every time the parent's `_handleShifting`
  // writes a new offset. Used by the example to verify whether nested child
  // gestures composed via `.blocksExternalGesture(parentGestureRef)` are
  // actually preventing the parent from panning the canvas concurrently.
  parentShiftCount: SharedValue<number>;
  // Debug counter — increments on every `_handleShifting` call past
  // panEnabled/shift-validity, regardless of whether the pause flag
  // suppresses the actual offset write. Difference vs `parentShiftCount`
  // shows how many frames the pause flag intercepted.
  parentShiftAttemptCount: SharedValue<number>;
  // Synchronous UI-thread "pause canvas pan" flag. Consumers nesting their
  // own gesture inside `staticPinIcon` set this `true` from their first
  // touch worklet (`onTouchesDown` / `onBegin`) and `false` on `onEnd` /
  // `onFinalize`. The parent's `_handleShifting` reads this on every frame
  // and skips its offset write when set — closing the leak window where a
  // child gesture is still in BEGAN (before its native activation) and the
  // parent is the only handler writing canvas state. Use the
  // `useZoomableViewPauseCanvas()` hook to access from a consumer.
  pauseCanvas: SharedValue<boolean>;
};

const ReactNativeZoomableViewContext =
  createContext<ZoomableViewContextValue | null>(null);

export const ReactNativeZoomableViewProvider = ({
  value,
  children,
}: {
  value: ZoomableViewContextValue;
  children: ReactNode;
}) => (
  <ReactNativeZoomableViewContext.Provider value={value}>
    {children}
  </ReactNativeZoomableViewContext.Provider>
);

export const useZoomableViewContext = () => {
  const context = useContext(ReactNativeZoomableViewContext);

  if (!context) {
    throw new Error(
      'useZoomableViewContext must be used within ReactNativeZoomableView'
    );
  }
  return context;
};

/**
 * Hook returning a `SharedValue<boolean>` that pauses the parent's
 * canvas pan in real time. Set `true` from the consumer's gesture
 * `onTouchesDown` / `onBegin` worklet and `false` from `onEnd` /
 * `onFinalize` so the parent stops writing canvas offsets the moment the
 * consumer's gesture starts receiving touches:
 *
 * ```tsx
 * const pauseCanvas = useZoomableViewPauseCanvas();
 * const myPan = useMemo(
 *   () =>
 *     Gesture.Pan()
 *       .onTouchesDown(() => { 'worklet'; pauseCanvas.value = true; })
 *       .onUpdate(...)
 *       .onFinalize(() => { 'worklet'; pauseCanvas.value = false; }),
 *   [pauseCanvas]
 * );
 * ```
 *
 * Both worklets run on the UI thread in the same JS context, so the parent
 * reads the latest value with zero dispatch latency. Pair with
 * `useZoomableViewParentGestureRef()` + `.blocksExternalGesture(parentRef)`:
 * `pauseCanvas` closes the leak window before native activation, and
 * `blocksExternalGesture` cancels the parent gesture once the consumer's
 * gesture activates natively.
 */
export const useZoomableViewPauseCanvas = () =>
  useZoomableViewContext().pauseCanvas;

/**
 * Hook returning the parent `ReactNativeZoomableView`'s pan/pinch gesture
 * ref. Use it to give a nested gesture priority on the regions it covers:
 *
 * ```tsx
 * const parentRef = useZoomableViewParentGestureRef();
 * const myPan = useMemo(
 *   () => Gesture.Pan().onUpdate(...).blocksExternalGesture(parentRef),
 *   [parentRef]
 * );
 * ```
 *
 * `blocksExternalGesture` makes the parent FAIL when this gesture activates,
 * so the canvas does not pan while the nested gesture is running. Areas of
 * the pin not wrapped in a child `GestureDetector` continue to forward
 * touches to the parent — canvas pan still works there.
 */
export const useZoomableViewParentGestureRef = () =>
  useZoomableViewContext().parentGestureRef;

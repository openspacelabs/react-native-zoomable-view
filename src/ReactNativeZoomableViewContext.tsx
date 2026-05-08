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

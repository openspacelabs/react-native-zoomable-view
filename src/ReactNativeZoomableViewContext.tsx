import React, { createContext, ReactNode, useContext } from 'react';
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
  // Synchronous UI-thread "pause parent gesture" flag. A consumer nesting
  // their own gesture inside `staticPinIcon` (or anywhere in the zoom
  // subject) sets this `true` from their gesture's first-touch worklet
  // (`onTouchesDown` / `onBegin`) and `false` on `onFinalize`. While set,
  // the parent ZoomableView skips its canvas-pan offset writes, its
  // long-press timer, and its tap classification — leaving the touch
  // entirely to the consumer's gesture. Both worklets run on the same UI
  // thread JS context, so the parent reads the latest value with zero
  // dispatch latency (no native gesture-recognizer round-trip).
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

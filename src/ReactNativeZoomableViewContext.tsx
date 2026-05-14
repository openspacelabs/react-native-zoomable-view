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

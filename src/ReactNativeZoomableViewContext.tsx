import React, { createContext, ReactNode, useContext } from 'react';
import { DerivedValue, SharedValue } from 'react-native-reanimated';

type ZoomableViewContextValue = {
  zoom: SharedValue<number>;
  inverseZoom: DerivedValue<number>;
  // A style that applies the inverse zoom level, so that children stay the same size when zooming.
  // Generic type for compatibility with React Native versions.
  inverseZoomStyle: { transform: { scale: number }[] };
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

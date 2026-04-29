import { createContext, useContext } from 'react';
import {
  AnimatedStyle,
  DerivedValue,
  SharedValue,
} from 'react-native-reanimated';

export const ReactNativeZoomableViewContext = createContext<{
  zoom: SharedValue<number>;
  inverseZoom: DerivedValue<number>;
  // A style that applies the inverse zoom level, so that children stay the same size when zooming.
  // Typed as Reanimated's AnimatedStyle so consumers can pass it straight to
  // Animated.View; assignable from `useAnimatedStyle()` return values.
  inverseZoomStyle: AnimatedStyle<{ transform: { scale: number }[] }>;
  offsetX: SharedValue<number>;
  offsetY: SharedValue<number>;
} | null>(null);

export const useZoomableViewContext = () => {
  const context = useContext(ReactNativeZoomableViewContext);

  if (!context) {
    throw new Error(
      'useZoomableViewContext must be used within ReactNativeZoomableView'
    );
  }
  return context;
};

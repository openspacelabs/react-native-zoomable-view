import { createContext } from 'react';
import { DerivedValue, SharedValue } from 'react-native-reanimated';

export const ReactNativeZoomableViewContext = createContext<
  | {
      zoom: SharedValue<number>;
      inverseZoom: DerivedValue<number>;
      // A style that applies the inverse zoom level, so that children stay the same size when zooming.
      // Generic type for compatibility with React Native versions.
      inverseZoomStyle: { transform: { scale: number }[] };
      offsetX: SharedValue<number>;
      offsetY: SharedValue<number>;
    }
  | undefined
>(undefined);

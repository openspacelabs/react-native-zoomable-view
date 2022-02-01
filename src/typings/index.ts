import { SharedValue } from 'react-native-reanimated';

export type ReactNativeZoomableViewProps = {
  children: React.ReactNode;
  scaleValue: SharedValue<number>;
  initialZoom?: number;
  maxZoom?: number;
  minZoom?: number;
  zoomEnabled?: boolean;
};

export interface Vec2D {
  x: number;
  y: number;
}

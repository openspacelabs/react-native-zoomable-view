import { ReactNode } from 'react';
import { LayoutChangeEvent, ViewProps } from 'react-native';
import { GestureTouchEvent } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

export interface ZoomableViewEvent {
  zoomLevel: number;
  offsetX: number;
  offsetY: number;
  originalHeight: number;
  originalWidth: number;
  gestureType?: 'shift' | 'pinch';
}

export type ReactNativeZoomableViewRef = {
  moveTo(newOffsetX: number, newOffsetY: number, zoomOverride?: number): void;
  moveBy(offsetChangeX: number, offsetChangeY: number): void;
  zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
  zoomBy(zoomLevelChange: number): boolean;
  moveStaticPinTo: (position: Vec2D, duration?: number) => void;
  readonly gestureStarted: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Worklet<T extends (...args: any[]) => any> = T;

export interface ReactNativeZoomableViewProps {
  // options
  style?: ViewProps['style'];
  children?: ReactNode;
  /** Content rendered as a sibling overlay (outside the zoom transform). */
  overlayContent?: ReactNode;
  zoomEnabled?: boolean;
  panEnabled?: boolean;
  initialZoom?: number;
  initialOffsetX?: number;
  initialOffsetY?: number;
  contentWidth?: number;
  contentHeight?: number;
  maxZoom?: number;
  minZoom?: number;
  doubleTapDelay?: number;
  doubleTapZoomToCenter?: boolean;
  zoomStep?: number;
  pinchToZoomInSensitivity?: number;
  pinchToZoomOutSensitivity?: number;
  movementSensitivity?: number;
  longPressDuration?: number;
  visualTouchFeedbackEnabled?: boolean;
  disablePanOnInitialZoom?: boolean;
  /** When false, pinch gestures only zoom without panning. Default true. */
  pinchPanEnabled?: boolean;
  contentRotation?: SharedValue<number>;

  // debug
  debug?: boolean;

  // callbacks
  onLayout?: (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void;
  /**
   * Called on the UI thread.
   * Must be a worklet.
   */
  onTransform?: Worklet<(zoomableViewEventObject: ZoomableViewEvent) => void>;
  onSingleTap?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => boolean | undefined;
  onDoubleTapBefore?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onDoubleTapAfter?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onShiftingEnd?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onMomentumEnd?: () => void;
  onZoomEnd?: (
    event: GestureTouchEvent | undefined,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onLongPress?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onPanResponderGrant?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onPanResponderEnd?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  onPanResponderMove?: Worklet<
    (
      event: GestureTouchEvent,
      zoomableViewEventObject: ZoomableViewEvent
    ) => boolean
  >;
  onPanResponderTerminate?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  staticPinPosition?: Vec2D;
  staticPinIcon?: React.ReactElement;
  /**
   * Called on the UI thread.
   * Must be a worklet.
   */
  /** Called on the UI thread with rotation delta in radians during two-finger gestures. */
  onRotation?: Worklet<(deltaRadians: number, fingerDist: number) => void>;
  onStaticPinPositionChange?: Worklet<(position: Vec2D) => void>;
  /**
   * Called on the UI thread.
   * Must be a worklet.
   */
  onStaticPinPositionMove?: Worklet<(position: Vec2D) => void>;
  pinProps?: ViewProps;
}

export interface Vec2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface TouchPoint extends Vec2D {
  id: string;
  isSecondTap?: boolean;
}

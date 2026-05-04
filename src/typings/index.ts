import { ReactNode } from 'react';
import { LayoutChangeEvent, ViewProps } from 'react-native';
import { GestureTouchEvent } from 'react-native-gesture-handler';

export interface ZoomableViewEvent {
  zoomLevel: number;
  offsetX: number;
  offsetY: number;
  originalHeight: number;
  originalWidth: number;
}

export type ReactNativeZoomableViewRef = {
  moveTo(newOffsetX: number, newOffsetY: number): void;
  moveBy(offsetChangeX: number, offsetChangeY: number): void;
  zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
  zoomBy(zoomLevelChange: number): boolean;
  moveStaticPinTo: (position: Vec2D, duration?: number) => void;
  readonly gestureStarted: boolean;
};

export interface ReactNativeZoomableViewProps {
  // options
  style?: ViewProps['style'];
  children?: ReactNode;
  zoomEnabled?: boolean;
  panEnabled?: boolean;
  initialZoom?: number;
  initialOffsetX?: number;
  initialOffsetY?: number;
  contentWidth?: number;
  contentHeight?: number;
  /** `null` (or omitted) means unlimited; runtime check is `!= null`. */
  maxZoom?: number | null;
  /** `null` (or omitted) means unlimited; runtime check is `!= null`. */
  minZoom?: number | null;
  doubleTapDelay?: number;
  doubleTapZoomToCenter?: boolean;
  /** `null` (or omitted) disables stepwise zoom; runtime check is `!= null`. */
  zoomStep?: number | null;
  /** `null` (or omitted) disables pinch-to-zoom-in sensitivity scaling; runtime check is `!= null`. */
  pinchToZoomInSensitivity?: number | null;
  /** `null` (or omitted) disables pinch-to-zoom-out sensitivity scaling; runtime check is `!= null`. */
  pinchToZoomOutSensitivity?: number | null;
  movementSensitivity?: number;
  longPressDuration?: number;
  visualTouchFeedbackEnabled?: boolean;
  disablePanOnInitialZoom?: boolean;

  // debug
  debug?: boolean;

  // callbacks
  onLayout?: (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void;
  /**
   * Called on the UI thread.
   * The function passed MUST contain a `'worklet';` directive as the first statement
   * — otherwise the Reanimated Babel plugin won't compile it as a worklet, and the
   * UI-thread invocation will crash. The `*Worklet` suffix on the prop name signals
   * this requirement.
   */
  onTransformWorklet?: (zoomableViewEventObject: ZoomableViewEvent) => void;
  onSingleTap?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
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
  /**
   * Called on the UI thread.
   * The function passed MUST contain a `'worklet';` directive as the first statement
   * — otherwise the Reanimated Babel plugin won't compile it as a worklet, and the
   * UI-thread invocation will crash. The `*Worklet` suffix on the prop name signals
   * this requirement.
   *
   * Return `true` to short-circuit the library's default pan/pinch handling.
   */
  onPanResponderMoveWorklet?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => boolean;
  onPanResponderTerminate?: (
    event: GestureTouchEvent,
    zoomableViewEventObject: ZoomableViewEvent
  ) => void;
  staticPinPosition?: Vec2D;
  staticPinIcon?: React.ReactElement;
  /**
   * Called on the JS thread once the static pin position has settled
   * (~100ms after the last motion). Use for state updates that should not
   * fire mid-gesture (e.g. persisting the final pin location).
   */
  onStaticPinPositionChange?: (position: Vec2D) => void;
  /**
   * Called on the UI thread on every transform that affects the static pin.
   * The function passed MUST contain a `'worklet';` directive as the first statement
   * — otherwise the Reanimated Babel plugin won't compile it as a worklet, and the
   * UI-thread invocation will crash. The `*Worklet` suffix on the prop name signals
   * this requirement.
   */
  onStaticPinPositionMoveWorklet?: (position: Vec2D) => void;
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

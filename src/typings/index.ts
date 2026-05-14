import { ReactNode } from 'react';
import { ViewProps } from 'react-native';
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
  /** Maximum zoom level (default `1.5`). Pass `Infinity` for unbounded zoom-in. */
  maxZoom?: number;
  /** Minimum zoom level (default `0.5`). Pass `-Infinity` for unbounded zoom-out. */
  minZoom?: number;
  doubleTapDelay?: number;
  doubleTapZoomToCenter?: boolean;
  /** Zoom step multiplier for double-tap and `zoomBy` (default `0.5`). */
  zoomStep?: number;
  /** Sensitivity multiplier for zoom-in pinch — defaults to 1. */
  pinchToZoomInSensitivity?: number;
  /** Sensitivity multiplier for zoom-out pinch — defaults to 1. */
  pinchToZoomOutSensitivity?: number;
  movementSensitivity?: number;
  longPressDuration?: number;
  visualTouchFeedbackEnabled?: boolean;
  disablePanOnInitialZoom?: boolean;

  // debug
  debug?: boolean;

  // callbacks
  onLayoutWorklet?: (layout: Size2D & Vec2D) => void;
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
  /** Return `true` to short-circuit the library's default pan/pinch handling. */
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

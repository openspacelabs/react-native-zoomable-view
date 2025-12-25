import { ReactNode } from 'react';
import { LayoutChangeEvent, PanResponderGestureState, ViewProps } from 'react-native';
import { GestureTouchEvent } from 'react-native-gesture-handler';
export interface ZoomableViewEvent {
    zoomLevel: number;
    offsetX: number;
    offsetY: number;
    originalHeight: number;
    originalWidth: number;
}
export interface ReactNativeZoomableViewProps {
    style?: ViewProps['style'];
    children?: ReactNode;
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
    movementSensibility?: number;
    longPressDuration?: number;
    visualTouchFeedbackEnabled?: boolean;
    disablePanOnInitialZoom?: boolean;
    debug?: boolean;
    onLayout?: (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void;
    onTransformWorklet?: (zoomableViewEventObject: ZoomableViewEvent) => void;
    onSingleTap?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onDoubleTapBefore?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onDoubleTapAfter?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onShiftingEnd?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onZoomEnd?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onLongPress?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onStartShouldSetPanResponder?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent, baseComponentResult: boolean) => boolean;
    onPanResponderGrant?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onPanResponderEnd?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onPanResponderMove?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => boolean;
    onPanResponderTerminate?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => void;
    onPanResponderTerminationRequest?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => boolean;
    onShouldBlockNativeResponder?: (event: GestureTouchEvent, zoomableViewEventObject: ZoomableViewEvent) => boolean;
    onStartShouldSetPanResponderCapture?: (event: GestureTouchEvent, gestureState: PanResponderGestureState) => boolean;
    onMoveShouldSetPanResponderCapture?: (event: GestureTouchEvent, gestureState: PanResponderGestureState) => boolean;
    staticPinPosition?: Vec2D;
    staticPinIcon?: React.ReactElement;
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
//# sourceMappingURL=index.d.ts.map
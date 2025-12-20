/// <reference types="lodash" />
import { Component, RefObject } from 'react';
import { GestureResponderEvent, PanResponderCallbacks, PanResponderGestureState, PanResponderInstance, View } from 'react-native';
import { ReactNativeZoomableViewProps, ReactNativeZoomableViewState, Vec2D, ZoomableViewEvent } from './typings';
declare class ReactNativeZoomableView extends Component<ReactNativeZoomableViewProps, ReactNativeZoomableViewState> {
    zoomSubjectWrapperRef: RefObject<View>;
    gestureHandlers: PanResponderInstance;
    doubleTapFirstTapReleaseTimestamp: number | undefined;
    static defaultProps: {
        zoomEnabled: boolean;
        panEnabled: boolean;
        initialZoom: number;
        initialOffsetX: number;
        initialOffsetY: number;
        maxZoom: number;
        minZoom: number;
        pinchToZoomInSensitivity: number;
        pinchToZoomOutSensitivity: number;
        movementSensibility: number;
        doubleTapDelay: number;
        zoomStep: number;
        onLongPress: null;
        longPressDuration: number;
        contentWidth: undefined;
        contentHeight: undefined;
        visualTouchFeedbackEnabled: boolean;
        staticPinPosition: undefined;
        staticPinIcon: undefined;
        onStaticPinPositionChange: undefined;
        onStaticPinPositionMove: undefined;
        disablePanOnInitialZoom: boolean;
    };
    private panAnim;
    private readonly zoomAnim;
    private offsetX;
    private offsetY;
    private zoomLevel;
    private lastGestureCenterPosition;
    private lastGestureTouchDistance;
    private gestureType;
    private _gestureStarted;
    private set gestureStarted(value);
    get gestureStarted(): boolean;
    /**
     * Last press time (used to evaluate whether user double tapped)
     * @type {number}
     */
    private longPressTimeout;
    private onTransformInvocationInitialized;
    private singleTapTimeoutId;
    private touches;
    private doubleTapFirstTap;
    private measureZoomSubjectInterval;
    constructor(props: ReactNativeZoomableViewProps);
    componentDidUpdate(prevProps: ReactNativeZoomableViewProps, prevState: ReactNativeZoomableViewState): void;
    componentDidMount(): void;
    componentWillUnmount(): void;
    debouncedOnStaticPinPositionChange: import("lodash").DebouncedFunc<(position: Vec2D) => void | undefined>;
    /**
     * try to invoke onTransform
     * @private
     */
    _invokeOnTransform(): {
        successful: boolean;
    };
    /**
     * Returns additional information about components current state for external event hooks
     *
     * @returns {{}}
     * @private
     */
    _getZoomableViewEventObject(overwriteObj?: {}): ZoomableViewEvent;
    /**
     * Get the original box dimensions and save them for later use.
     * (They will be used to calculate boxBorders)
     *
     * @private
     */
    private measureZoomSubject;
    /**
     * Handles the start of touch events and checks for taps
     *
     * @param e
     * @param gestureState
     * @returns {boolean}
     *
     * @private
     */
    _handleStartShouldSetPanResponder: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => boolean;
    /**
     * Calculates pinch distance
     *
     * @param e
     * @param gestureState
     * @private
     */
    _handlePanResponderGrant: NonNullable<PanResponderCallbacks['onPanResponderGrant']>;
    /**
     * Handles the end of touch events
     *
     * @param e
     * @param gestureState
     *
     * @private
     */
    _handlePanResponderEnd: NonNullable<PanResponderCallbacks['onPanResponderEnd']>;
    /**
     * Handles the actual movement of our pan responder
     *
     * @param e
     * @param gestureState
     *
     * @private
     */
    _handlePanResponderMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => boolean | undefined;
    /**
     * Handles the pinch movement and zooming
     *
     * @param e
     * @param gestureState
     *
     * @private
     */
    _handlePinching(e: GestureResponderEvent, gestureState: PanResponderGestureState): void;
    /**
     * Used to debug pinch events
     * @param gestureResponderEvent
     * @param zoomCenter
     * @param points
     */
    _setPinchDebugPoints(gestureResponderEvent: GestureResponderEvent, zoomCenter: Vec2D, ...points: Vec2D[]): void;
    /**
     * Calculates the amount the offset should shift since the last position during panning
     *
     * @param {Vec2D} gestureCenterPoint
     *
     * @private
     */
    _calcOffsetShiftSinceLastGestureState(gestureCenterPoint: Vec2D): {
        x: number;
        y: number;
    } | null;
    /**
     * Handles movement by tap and move
     *
     * @param gestureState
     *
     * @private
     */
    _handleShifting(gestureState: PanResponderGestureState): void;
    /**
     * Set the state to offset moved
     *
     * @param {number} newOffsetX
     * @param {number} newOffsetY
     * @returns
     */
    _setNewOffsetPosition(newOffsetX: number, newOffsetY: number): void;
    /**
     * Check whether the press event is double tap
     * or single tap and handle the event accordingly
     *
     * @param e
     *
     * @private
     */
    private _resolveAndHandleTap;
    moveStaticPinTo: (position: Vec2D, duration?: number) => void;
    private _staticPinPosition;
    private _updateStaticPin;
    private _addTouch;
    private _removeTouch;
    /**
     * Handles the double tap event
     *
     * @param e
     *
     * @private
     */
    _handleDoubleTap(e: GestureResponderEvent): void;
    /**
     * Returns the next zoom step based on current step and zoomStep property.
     * If we are zoomed all the way in -> return to initialzoom
     *
     * @returns {*}
     */
    _getNextZoomStep(): number | undefined;
    /**
     * Zooms to a specific level. A "zoom center" can be provided, which specifies
     * the point that will remain in the same position on the screen after the zoom.
     * The coordinates of the zoom center is relative to the zoom subject.
     * { x: 0, y: 0 } is the very center of the zoom subject.
     *
     * @param newZoomLevel
     * @param zoomCenter - If not supplied, the container's center is the zoom center
     */
    zoomTo(newZoomLevel: number, zoomCenter?: Vec2D): boolean;
    /**
     * Zooms in or out by a specified change level
     * Use a positive number for `zoomLevelChange` to zoom in
     * Use a negative number for `zoomLevelChange` to zoom out
     *
     * Returns a promise if everything was updated and a boolean, whether it could be updated or if it exceeded the min/max zoom limits.
     *
     * @param {number | null} zoomLevelChange
     *
     * @return {bool}
     */
    zoomBy(zoomLevelChange: number): boolean;
    /**
     * Moves the zoomed view to a specified position
     * Returns a promise when finished
     *
     * @param {number} newOffsetX the new position we want to move it to (x-axis)
     * @param {number} newOffsetY the new position we want to move it to (y-axis)
     *
     * @return {bool}
     */
    moveTo(newOffsetX: number, newOffsetY: number): void;
    /**
     * Moves the zoomed view by a certain amount.
     *
     * Returns a promise when finished
     *
     * @param {number} offsetChangeX the amount we want to move the offset by (x-axis)
     * @param {number} offsetChangeY the amount we want to move the offset by (y-axis)
     *
     * @return {bool}
     */
    moveBy(offsetChangeX: number, offsetChangeY: number): void;
    render(): JSX.Element;
}
export default ReactNativeZoomableView;
export { ReactNativeZoomableView };
//# sourceMappingURL=ReactNativeZoomableView.d.ts.map
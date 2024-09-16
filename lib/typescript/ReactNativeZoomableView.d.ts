/// <reference types="node" />
import { Component, RefObject } from 'react';
import { GestureResponderEvent, PanResponderGestureState, View } from 'react-native';
import { Vec2D, ReactNativeZoomableViewProps, ReactNativeZoomableViewState, ZoomableViewEvent } from './typings';
declare class ReactNativeZoomableView extends Component<ReactNativeZoomableViewProps, ReactNativeZoomableViewState> {
    zoomSubjectWrapperRef: RefObject<View>;
    gestureHandlers: any;
    doubleTapFirstTapReleaseTimestamp: number;
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
        bindToBorders: boolean;
        zoomStep: number;
        onLongPress: any;
        longPressDuration: number;
        contentWidth: any;
        contentHeight: any;
        panBoundaryPadding: number;
        visualTouchFeedbackEnabled: boolean;
        staticPinPosition: any;
        staticPinIcon: any;
        onStaticPinPositionChange: any;
        onStaticPinPositionMove: any;
        animatePin: boolean;
        disablePanOnInitialZoom: boolean;
    };
    private panAnim;
    private zoomAnim;
    private pinAnim;
    private __offsets;
    private zoomLevel;
    private lastGestureCenterPosition;
    private lastGestureTouchDistance;
    private gestureType;
    private gestureStarted;
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
    constructor(props: any);
    private raisePin;
    private dropPin;
    private set offsetX(value);
    private set offsetY(value);
    private get offsetX();
    private get offsetY();
    private __setOffset;
    private __getOffset;
    componentDidUpdate(prevProps: ReactNativeZoomableViewProps, prevState: ReactNativeZoomableViewState): void;
    componentDidMount(): void;
    componentWillUnmount(): void;
    debouncedOnStaticPinPositionChange: any;
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
    private grabZoomSubjectOriginalMeasurements;
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
    _handlePanResponderGrant: (e: any, gestureState: any) => void;
    /**
     * Handles the end of touch events
     *
     * @param e
     * @param gestureState
     *
     * @private
     */
    _handlePanResponderEnd: (e: any, gestureState: any) => void;
    /**
     * Handles the actual movement of our pan responder
     *
     * @param e
     * @param gestureState
     *
     * @private
     */
    _handlePanResponderMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => boolean;
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
    _calcOffsetShiftSinceLastGestureState(gestureCenterPoint: Vec2D): any;
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
    _setNewOffsetPosition(newOffsetX: number, newOffsetY: number): Promise<void>;
    /**
     * Check whether the press event is double tap
     * or single tap and handle the event accordingly
     *
     * @param e
     *
     * @private
     */
    private _resolveAndHandleTap;
    _moveTimeout: NodeJS.Timeout;
    moveStaticPinTo: (position: Vec2D) => void;
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
    _getNextZoomStep(): number;
    /**
     * Zooms to a specific location in our view
     *
     * @param x
     * @param y
     * @param newZoomLevel
     *
     * @private
     */
    _zoomToLocation(x: number, y: number, newZoomLevel: number): Promise<void>;
    /**
     * Zooms to a specificied zoom level.
     * Returns a promise if everything was updated and a boolean, whether it could be updated or if it exceeded the min/max zoom limits.
     *
     * @param {number} newZoomLevel
     *
     * @return {Promise<bool>}
     */
    zoomTo(newZoomLevel: number): Promise<boolean>;
    /**
     * Zooms in or out by a specified change level
     * Use a positive number for `zoomLevelChange` to zoom in
     * Use a negative number for `zoomLevelChange` to zoom out
     *
     * Returns a promise if everything was updated and a boolean, whether it could be updated or if it exceeded the min/max zoom limits.
     *
     * @param {number | null} zoomLevelChange
     *
     * @return {Promise<bool>}
     */
    zoomBy(zoomLevelChange?: number): Promise<boolean>;
    /**
     * Moves the zoomed view to a specified position
     * Returns a promise when finished
     *
     * @param {number} newOffsetX the new position we want to move it to (x-axis)
     * @param {number} newOffsetY the new position we want to move it to (y-axis)
     *
     * @return {Promise<bool>}
     */
    moveTo(newOffsetX: number, newOffsetY: number): Promise<void>;
    /**
     * Moves the zoomed view by a certain amount.
     *
     * Returns a promise when finished
     *
     * @param {number} offsetChangeX the amount we want to move the offset by (x-axis)
     * @param {number} offsetChangeY the amount we want to move the offset by (y-axis)
     *
     * @return {Promise<bool>}
     */
    moveBy(offsetChangeX: number, offsetChangeY: number): Promise<void>;
    render(): JSX.Element;
}
export default ReactNativeZoomableView;
export { ReactNativeZoomableView };

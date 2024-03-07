import { ReactNativeZoomableViewState, ReactNativeZoomableViewWithGesturesProps } from './typings';
import React from 'react';
export declare const swipeDirections: {
    SWIPE_UP: string;
    SWIPE_DOWN: string;
    SWIPE_LEFT: string;
    SWIPE_RIGHT: string;
};
declare class ReactNativeZoomableViewWithGestures extends React.Component<ReactNativeZoomableViewWithGesturesProps, ReactNativeZoomableViewState> {
    _onShiftingEnd: (e: any, gestureState: any, zoomableViewState: any) => void;
    /**
     * Checks if current config options make it possible to process a swipe or if is not necessary
     *
     * @returns {*}
     * @private
     */
    _couldCallSwipeEvent(zoomableViewState: any): false | ((gestureState: import("react-native").PanResponderGestureState) => void);
    /**
     * Checks the swipe and validates whether we should process it or not
     *
     * @param gestureState
     * @returns {*|boolean}
     *
     * @private
     */
    _validateSwipe(gestureState: any): boolean;
    /**
     * Triggers the correct directional callback
     *
     * @param swipeDirection
     * @param gestureState
     * @private
     */
    _triggerSwipeHandlers(swipeDirection: any, gestureState: any): void;
    /**
     * Calculates what direction the user swiped
     *
     * @param gestureState
     * @returns {*}
     * @private
     */
    _getSwipeDirection(gestureState: any): string;
    /**
     * Checks, whether the swipe was done in a horizontal fashion, respecting swipeVelocityThreshold limits
     *
     * @param gestureState
     * @returns {*}
     *
     * @private
     */
    _isValidHorizontalSwipe(gestureState: any): boolean;
    /**
     * Checks, whether the swipe was done in a vertical fashion, respecting swipeVelocityThreshold limits
     *
     * @param gestureState
     * @returns {*}
     *
     * @private
     */
    _isValidVerticalSwipe(gestureState: any): boolean;
    /**
     * Checks the sipw against velocity and directional offset to make sure it only gets activated, when we actually need it
     *
     * @param velocity
     * @param swipeVelocityThreshold
     * @param directionalOffset
     * @param swipeDirectionalThreshold
     *
     * @returns {boolean}
     *
     * @private
     */
    _isValidSwipe(velocity: any, swipeVelocityThreshold: any, directionalOffset: any, swipeDirectionalThreshold: any): boolean;
    render(): JSX.Element;
}
export default ReactNativeZoomableViewWithGestures;

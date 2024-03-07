import { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { Vec2D } from '../typings';
export { calcNewScaledOffsetForZoomCentering } from './calcNewScaledOffsetForZoomCentering';
/**
 * Calculates the gesture center point relative to the page coordinate system
 *
 * We're unable to use touch.locationX/Y
 * because locationX uses the axis system of the leaf element that the touch occurs on,
 * which makes it even more complicated to translate into our container's axis system.
 *
 * We're also unable to use gestureState.moveX/Y
 * because gestureState.moveX/Y is messed up on real device
 * (Sometimes it's the center point, but sometimes it randomly takes the position of one of the touches)
 */
export declare function calcGestureCenterPoint(e: GestureResponderEvent, gestureState: PanResponderGestureState): Vec2D | null;
export declare function calcGestureTouchDistance(e: GestureResponderEvent, gestureState: PanResponderGestureState): number | null;

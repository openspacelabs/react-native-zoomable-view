import {
  GestureTouchEvent,
  GestureUpdateEvent,
  PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';

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
export function calcGestureCenterPoint(e: GestureTouchEvent): Vec2D | null {
  'worklet';

  const touches = e.allTouches;
  if (!touches[0]) return null;

  if (e.numberOfTouches === 2) {
    if (!touches[1]) return null;
    return {
      x: (touches[0].x + touches[1].x) / 2,
      y: (touches[0].y + touches[1].y) / 2,
    };
  }
  if (e.numberOfTouches === 1) {
    return { x: touches[0].x, y: touches[0].y };
  }

  return null;
}

export function calcGestureTouchDistance(e: GestureTouchEvent): number | null {
  'worklet';

  const touches = e.allTouches;
  if (e.numberOfTouches !== 2 || !touches[0] || !touches[1]) return null;

  const dx = Math.abs(touches[0].x - touches[1].x);
  const dy = Math.abs(touches[0].x - touches[1].x);
  return Math.sqrt(dx * dx + dy * dy);
}

import { useState } from 'react';
import { GestureTouchEvent } from 'react-native-gesture-handler';

import { Vec2D } from '../typings';
import { useLatestCallback } from './useLatestCallback';

export const useDebugPoints = () => {
  const [debugPoints, setDebugPoints] = useState<Vec2D[]>([]);

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const setPinchDebugPoints = useLatestCallback(
    (e: GestureTouchEvent, zoomCenter: Vec2D, ...points: Vec2D[]) => {
      setDebugPoints([
        { x: e.allTouches[0].x, y: e.allTouches[0].y },
        { x: e.allTouches[1].x, y: e.allTouches[1].y },
        zoomCenter,
        ...points,
      ]);
    }
  );

  return { debugPoints, setDebugPoints, setPinchDebugPoints };
};

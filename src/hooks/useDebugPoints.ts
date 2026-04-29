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
      const t0 = e.allTouches[0];
      const t1 = e.allTouches[1];
      if (!t0 || !t1) return;
      setDebugPoints([
        { x: t0.x, y: t0.y },
        { x: t1.x, y: t1.y },
        zoomCenter,
        ...points,
      ]);
    }
  );

  return { debugPoints, setDebugPoints, setPinchDebugPoints };
};
